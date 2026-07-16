"""
filter_dataset.py
─────────────────
Analyzes every image in the COCO forearm dataset, scores each annotation
for quality (geometric + model prediction error), then removes the worst ones
and saves cleaned _annotations.coco.json files.

Usage:
  py -3 filter_dataset.py --dataset <path>
  py -3 filter_dataset.py                   # auto-finds in Downloads

What it removes:
  • Annotations where the bounding box is too square (not forearm-shaped)
  • Annotations where the bbox is tiny (< 3% of image area)
  • Annotations where model prediction error is in the top 25% (outliers)
  • Optionally deletes the corresponding image files with --delete-images
"""

import os, sys, json, math, shutil, argparse
import numpy as np

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

LOCAL_MODEL_PATH = "rl_model_data.json"
FOREARM_DEFAULTS = [50.0, 18.0, 50.0, 50.0, 50.0, 82.0]

# ── Reuse model from train_from_dataset.py ────────────────────────────────────

class LandmarkRLModel:
    def __init__(self, input_dim=27, hidden_1=32, hidden_2=16, output_dim=6):
        self.input_dim = input_dim; self.hidden_1 = hidden_1
        self.hidden_2 = hidden_2;   self.output_dim = output_dim
        self.reset_weights()

    def reset_weights(self):
        self.W1 = np.random.randn(self.input_dim, self.hidden_1) * np.sqrt(2./self.input_dim)
        self.b1 = np.zeros((1, self.hidden_1))
        self.W2 = np.random.randn(self.hidden_1, self.hidden_2) * np.sqrt(2./self.hidden_1)
        self.b2 = np.zeros((1, self.hidden_2))
        self.W3 = np.zeros((self.hidden_2, self.output_dim))
        self.b3 = np.zeros((1, self.output_dim))

    def forward(self, X):
        h1 = np.maximum(0, np.dot(X, self.W1) + self.b1)
        h2 = np.maximum(0, np.dot(h1,  self.W2) + self.b2)
        return np.dot(h2, self.W3) + self.b3

    def from_dict(self, d):
        self.W1 = np.array(d["W1"]); self.b1 = np.array(d["b1"])
        self.W2 = np.array(d["W2"]); self.b2 = np.array(d["b2"])
        self.W3 = np.array(d["W3"]); self.b3 = np.array(d["b3"])

def load_model():
    model = LandmarkRLModel()
    if os.path.exists(LOCAL_MODEL_PATH):
        with open(LOCAL_MODEL_PATH) as f:
            d = json.load(f)
        model.from_dict(d["weights"])
        print(f"[OK] Loaded model weights from {LOCAL_MODEL_PATH}")
    else:
        print("[WARN] No model weights found — using random weights for error estimation")
    return model

# ── Geometry helpers ──────────────────────────────────────────────────────────

def bbox_to_landmarks_pct(bbox, img_w, img_h):
    x, y, w, h = bbox
    cx, cy = x + w/2, y + h/2
    if h >= w:
        pts = [cx, y, cx, cy, cx, y+h]
    else:
        pts = [x, cy, cx, cy, x+w, cy]
    def pct(v, d): return max(5., min(95., (v/d)*100.))
    return [pct(pts[0],img_w), pct(pts[1],img_h),
            pct(pts[2],img_w), pct(pts[3],img_h),
            pct(pts[4],img_w), pct(pts[5],img_h)]

def build_state(ann, img_w, img_h):
    x, y, w, h = ann['bbox']
    s = np.zeros(27)
    s[0] = 35./100.
    s[1] = 1.           # Male default
    cx_pct = (x + w/2) / img_w
    s[4 if cx_pct < 0.5 else 5] = 1.
    s[6] = 1.           # Forearm
    s[14] = 1.          # Normal mobility
    s[17] = 1.          # No swelling
    s[21 if h >= w else (23 if cx_pct < 0.5 else 24)] = 1.
    return s

def aspect_ratio_score(bbox, img_w, img_h):
    """
    Returns a quality score 0.0-1.0 for how 'forearm-like' the bbox shape is.
    A forearm should be elongated: aspect ratio >= 1.5 (length 1.5x its width).
    Score = 1.0 if AR >= 2.0, scales down to 0.0 if AR < 1.0 (too square).
    """
    x, y, w, h = bbox
    long_side  = max(w, h)
    short_side = min(w, h)
    if short_side == 0:
        return 0.0
    ar = long_side / short_side
    return min(1.0, max(0.0, (ar - 1.0) / 1.5))   # 0 at AR=1.0, 1.0 at AR>=2.5

def size_score(bbox, img_w, img_h):
    """
    Returns 0.0-1.0 based on how much of the image the bbox covers.
    Too small → probably a noisy/partial detection.
    Score = 1.0 if bbox covers >= 10% of image, 0.0 if < 2%.
    """
    area_pct = (bbox[2] * bbox[3]) / (img_w * img_h) * 100.
    return min(1.0, max(0.0, (area_pct - 2.0) / 8.0))

def edge_score(bbox, img_w, img_h):
    """
    Penalise bboxes that are mostly outside the image (annotation errors).
    """
    x, y, w, h = bbox
    x2, y2 = x+w, y+h
    overlap_x = max(0, min(x2, img_w) - max(x, 0))
    overlap_y = max(0, min(y2, img_h) - max(y, 0))
    overlap_area = overlap_x * overlap_y
    bbox_area = w * h
    if bbox_area == 0:
        return 0.0
    return overlap_area / bbox_area

# ── Analysis ──────────────────────────────────────────────────────────────────

def analyze_split(split_dir, model, split_name):
    ann_path = os.path.join(split_dir, "_annotations.coco.json")
    if not os.path.exists(ann_path):
        print(f"  [SKIP] No annotation file in {split_dir}")
        return [], {}

    with open(ann_path) as f:
        data = json.load(f)

    img_map  = {img['id']: img for img in data.get('images', [])}
    anns     = data.get('annotations', [])
    results  = []

    for ann in anns:
        img_info = img_map.get(ann['image_id'])
        if not img_info:
            continue
        img_w = img_info.get('width',  640)
        img_h = img_info.get('height', 480)
        bbox  = ann.get('bbox')
        if not bbox or len(bbox) < 4 or bbox[2] <= 0 or bbox[3] <= 0:
            continue

        # Geometric quality scores
        ar_sc   = aspect_ratio_score(bbox, img_w, img_h)
        sz_sc   = size_score(bbox, img_w, img_h)
        edge_sc = edge_score(bbox, img_w, img_h)
        geo_score = (ar_sc * 0.5 + sz_sc * 0.3 + edge_sc * 0.2)

        # Model prediction error
        state  = build_state(ann, img_w, img_h)
        coords = bbox_to_landmarks_pct(bbox, img_w, img_h)
        target = np.array(coords) - np.array(FOREARM_DEFAULTS)
        pred   = model.forward(state.reshape(1,-1)).flatten()
        error  = float(np.mean(np.abs(pred - target)))

        results.append({
            'ann_id':   ann['id'],
            'image_id': ann['image_id'],
            'filename': img_info.get('file_name', ''),
            'bbox':     bbox,
            'img_w':    img_w,
            'img_h':    img_h,
            'ar_score': round(ar_sc,   3),
            'sz_score': round(sz_sc,   3),
            'geo_score':round(geo_score,3),
            'error':    round(error,   3),
            'split':    split_name,
        })

    return results, data

def compute_thresholds(all_results):
    errors    = [r['error']     for r in all_results]
    geo_scores= [r['geo_score'] for r in all_results]

    err_mean, err_std = np.mean(errors), np.std(errors)
    # Remove samples more than 1 SD above the mean error
    error_threshold = err_mean + err_std

    # Remove samples with geometric score below 0.35 (too square / too small)
    geo_threshold = 0.35

    print(f"\n  Error stats:  mean={err_mean:.2f}  std={err_std:.2f}  threshold={error_threshold:.2f}")
    print(f"  Geo   stats:  mean={np.mean(geo_scores):.3f}  threshold={geo_threshold:.3f}")
    return error_threshold, geo_threshold

def filter_and_save(split_dir, split_results, orig_data,
                    error_thresh, geo_thresh, delete_images=False):
    if not split_results:
        return 0, 0

    bad_ann_ids  = set()
    bad_img_ids  = set()
    bad_filenames= []

    for r in split_results:
        is_bad = (r['error'] > error_thresh) or (r['geo_score'] < geo_thresh)
        if is_bad:
            bad_ann_ids.add(r['ann_id'])
            bad_img_ids.add(r['image_id'])
            bad_filenames.append(r['filename'])

    total     = len(split_results)
    n_removed = len(bad_ann_ids)

    # Filter annotations JSON
    new_anns   = [a for a in orig_data['annotations'] if a['id'] not in bad_ann_ids]
    
    # Keep images that have at least one annotation remaining
    remaining_img_ids = {a['image_id'] for a in new_anns}
    new_images = [i for i in orig_data['images'] if i['id'] in remaining_img_ids]

    new_data = {**orig_data, 'annotations': new_anns, 'images': new_images}
    ann_path = os.path.join(split_dir, "_annotations.coco.json")

    # Backup original
    backup_path = ann_path.replace('.json', '.backup.json')
    if not os.path.exists(backup_path):
        shutil.copy(ann_path, backup_path)
        print(f"  [OK] Backed up original -> {os.path.basename(backup_path)}")

    with open(ann_path, 'w') as f:
        json.dump(new_data, f, indent=2)
    print(f"  [OK] Saved filtered annotations ({n_removed} removed from {total})")

    # Optionally delete image files
    if delete_images and bad_filenames:
        deleted = 0
        for fname in bad_filenames:
            img_path = os.path.join(split_dir, fname)
            if os.path.exists(img_path):
                os.remove(img_path)
                deleted += 1
        print(f"  [OK] Deleted {deleted} bad image files")

    return total, n_removed

# ── Report ────────────────────────────────────────────────────────────────────

def print_worst(all_results, n=20):
    print(f"\n{'='*70}")
    print(f"  TOP {n} WORST QUALITY SAMPLES")
    print(f"{'='*70}")
    print(f"  {'Filename':<45} {'Error':>6}  {'AR':>5}  {'Sz':>5}  {'Geo':>5}")
    print(f"  {'-'*65}")
    sorted_r = sorted(all_results, key=lambda x: x['error'], reverse=True)
    for r in sorted_r[:n]:
        fname = r['filename'][:44]
        print(f"  {fname:<45} {r['error']:>6.2f}  {r['ar_score']:>5.2f}  {r['sz_score']:>5.2f}  {r['geo_score']:>5.2f}")

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Filter bad forearm images from COCO dataset')
    parser.add_argument('--dataset',       default='forearm.coco-segmentation')
    parser.add_argument('--delete-images', action='store_true',
                        help='Actually delete bad image files (default: only update JSON)')
    parser.add_argument('--error-threshold', type=float, default=None,
                        help='Manual error threshold (default: mean + 1 std)')
    parser.add_argument('--geo-threshold',   type=float, default=0.35,
                        help='Min geometry score to keep (default: 0.35)')
    args = parser.parse_args()

    dataset_dir = args.dataset
    if not os.path.isdir(dataset_dir):
        alt = os.path.join(os.path.expanduser("~"), "Downloads", dataset_dir)
        if os.path.isdir(alt):
            dataset_dir = alt
        else:
            print(f"[ERR] Dataset not found: {args.dataset}")
            sys.exit(1)

    print(f"\n{'='*70}")
    print("  OrthoMeasure -- COCO Dataset Quality Filter")
    print(f"  Dataset: {dataset_dir}")
    print(f"{'='*70}\n")

    model = load_model()

    # Analyze all splits
    all_results = []
    split_data  = {}   # split_name -> (split_dir, results, orig_data)

    for split in ['train', 'valid', 'test']:
        split_dir = os.path.join(dataset_dir, split)
        if not os.path.isdir(split_dir):
            continue
        print(f"  Analyzing {split}/ ...")
        results, orig_data = analyze_split(split_dir, model, split)
        print(f"    -> {len(results)} annotations scored")
        all_results.extend(results)
        split_data[split] = (split_dir, results, orig_data)

    if not all_results:
        print("[ERR] No annotations found.")
        sys.exit(1)

    # Print worst samples
    print_worst(all_results, n=20)

    # Compute thresholds
    error_thresh = args.error_threshold
    geo_thresh   = args.geo_threshold
    if error_thresh is None:
        computed_err_thresh, _ = compute_thresholds(all_results)
        error_thresh = computed_err_thresh

    # Count what would be removed
    bad = [r for r in all_results if r['error'] > error_thresh or r['geo_score'] < geo_thresh]
    print(f"\n  Would remove {len(bad)}/{len(all_results)} annotations "
          f"({len(bad)/len(all_results)*100:.1f}%)\n")

    # Filter each split
    print(f"\n{'='*70}")
    print("  FILTERING SPLITS")
    print(f"{'='*70}")
    total_removed = 0

    for split, (split_dir, split_results, orig_data) in split_data.items():
        if not split_results:
            continue
        print(f"\n  [{split}/]")
        tot, rem = filter_and_save(
            split_dir, split_results, orig_data,
            error_thresh, geo_thresh,
            delete_images=args.delete_images
        )
        total_removed += rem

    print(f"\n{'='*70}")
    print("  FILTER COMPLETE")
    print(f"{'='*70}")
    print(f"  Total removed : {total_removed} annotations")
    print(f"  Remaining     : {len(all_results) - total_removed} annotations")
    print()
    print("  Next steps:")
    print("  1. Review the report above")
    print("  2. Retrain the model on the cleaned dataset:")
    print(f"     py -3 train_from_dataset.py --dataset \"{dataset_dir}\" --epochs 400 --lr 0.005")
    print()
    print("  To restore originals if needed:")
    for split in split_data:
        ann_bak = os.path.join(dataset_dir, split, "_annotations.backup.json")
        if os.path.exists(ann_bak):
            print(f"     copy \"{ann_bak}\" \"{os.path.join(dataset_dir, split, '_annotations.coco.json')}\"")

if __name__ == '__main__':
    main()
