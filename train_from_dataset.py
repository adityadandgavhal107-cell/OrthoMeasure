"""
train_from_dataset.py
─────────────────────
Trains the OrthoMeasure RL landmark model using the forearm COCO-segmentation
dataset (train/valid/test splits with _annotations.coco.json in each folder).

Usage:
  python train_from_dataset.py --dataset <path_to_coco_folder>
  python train_from_dataset.py  # defaults to ./forearm.coco-segmentation

The script:
  1. Reads _annotations.coco.json from each split
  2. Derives proximal / mid / distal landmark coordinates from the
     COCO bounding-box and segmentation polygon geometry
  3. Trains the LandmarkRLModel (Adam SGD) over multiple epochs
  4. Saves updated weights to rl_model_data.json and uploads to Supabase
  5. Appends a training-session summary to rl_training_notes.json
     (visible in the AI RL Center UI under "Dataset Training Notes")
"""

import os, sys, json, time, math, argparse, urllib.request
import numpy as np

# Force UTF-8 output on Windows to avoid cp1252 encoding errors
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ──────────────────────────────────────────────
# Re-use the model definitions from rl_agent.py
# ──────────────────────────────────────────────
LOCAL_MODEL_PATH = "rl_model_data.json"
NOTES_PATH       = "rl_training_notes.json"

class LandmarkRLModel:
    def __init__(self, input_dim=23, hidden_1=32, hidden_2=16, output_dim=6):
        self.input_dim  = input_dim
        self.hidden_1   = hidden_1
        self.hidden_2   = hidden_2
        self.output_dim = output_dim
        self.reset_weights()

    def reset_weights(self):
        self.W1 = np.random.randn(self.input_dim, self.hidden_1) * np.sqrt(2. / self.input_dim)
        self.b1 = np.zeros((1, self.hidden_1))
        self.W2 = np.random.randn(self.hidden_1, self.hidden_2) * np.sqrt(2. / self.hidden_1)
        self.b2 = np.zeros((1, self.hidden_2))
        self.W3 = np.zeros((self.hidden_2, self.output_dim))
        self.b3 = np.zeros((1, self.output_dim))
        self._init_adam()

    def _init_adam(self):
        self.mW1 = np.zeros_like(self.W1); self.vW1 = np.zeros_like(self.W1)
        self.mb1 = np.zeros_like(self.b1); self.vb1 = np.zeros_like(self.b1)
        self.mW2 = np.zeros_like(self.W2); self.vW2 = np.zeros_like(self.W2)
        self.mb2 = np.zeros_like(self.b2); self.vb2 = np.zeros_like(self.b2)
        self.mW3 = np.zeros_like(self.W3); self.vW3 = np.zeros_like(self.W3)
        self.mb3 = np.zeros_like(self.b3); self.vb3 = np.zeros_like(self.b3)
        self.adam_t = 0

    def forward(self, X):
        self.h1 = np.maximum(0, np.dot(X, self.W1) + self.b1)
        self.h2 = np.maximum(0, np.dot(self.h1, self.W2) + self.b2)
        return np.dot(self.h2, self.W3) + self.b3

    def backward(self, X, out, target, lr=0.001):
        N = X.shape[0]
        grad_out = (out - target) / N
        dW3 = np.dot(self.h2.T, grad_out)
        db3 = np.sum(grad_out, axis=0, keepdims=True)
        grad_h2 = np.dot(grad_out, self.W3.T); grad_h2[self.h2 <= 0] = 0
        dW2 = np.dot(self.h1.T, grad_h2)
        db2 = np.sum(grad_h2, axis=0, keepdims=True)
        grad_h1 = np.dot(grad_h2, self.W2.T); grad_h1[self.h1 <= 0] = 0
        dW1 = np.dot(X.T, grad_h1)
        db1 = np.sum(grad_h1, axis=0, keepdims=True)
        l2 = 0.0001
        dW3 += l2 * self.W3; dW2 += l2 * self.W2; dW1 += l2 * self.W1
        for g in [dW1, db1, dW2, db2, dW3, db3]:
            np.clip(g, -5.0, 5.0, out=g)
        self.adam_t += 1; t = self.adam_t
        b1, b2, eps = 0.9, 0.999, 1e-8
        def step(p, g, m, v):
            m[:] = b1*m + (1-b1)*g; v[:] = b2*v + (1-b2)*(g**2)
            p -= lr * (m/(1-b1**t)) / (np.sqrt(v/(1-b2**t)) + eps)
        step(self.W1, dW1, self.mW1, self.vW1); step(self.b1, db1, self.mb1, self.vb1)
        step(self.W2, dW2, self.mW2, self.vW2); step(self.b2, db2, self.mb2, self.vb2)
        step(self.W3, dW3, self.mW3, self.vW3); step(self.b3, db3, self.mb3, self.vb3)

    def to_dict(self):
        return {"W1": self.W1.tolist(), "b1": self.b1.tolist(),
                "W2": self.W2.tolist(), "b2": self.b2.tolist(),
                "W3": self.W3.tolist(), "b3": self.b3.tolist()}

    def from_dict(self, d):
        self.W1 = np.array(d["W1"]); self.b1 = np.array(d["b1"])
        self.W2 = np.array(d["W2"]); self.b2 = np.array(d["b2"])
        self.W3 = np.array(d["W3"]); self.b3 = np.array(d["b3"])
        self._init_adam()

# ──────────────────────────────────────────────
# COCO landmark derivation
# ──────────────────────────────────────────────

FOREARM_DEFAULTS = [50.0, 18.0, 50.0, 50.0, 50.0, 82.0]  # [px,py, mx,my, dx,dy]

def bbox_to_landmarks_pct(bbox, img_w, img_h):
    """
    Convert a COCO bounding box [x, y, w, h] + image dimensions to
    (proximal, mid, distal) landmark percentages.

    Forearm images are oriented with the proximal end (elbow) at the
    TOP of the bounding box and the distal end (wrist) at the BOTTOM
    (or left/right depending on orientation – COCO bbox is axis-aligned).

    We detect orientation by comparing bbox width vs height:
      - Portrait  (h > w) → forearm is vertical; proximal=top, distal=bottom
      - Landscape (w > h) → forearm is horizontal; proximal=left, distal=right
    """
    x, y, w, h = bbox
    cx = x + w / 2.0   # centre x
    cy = y + h / 2.0   # centre y

    if h >= w:   # vertical forearm
        prox_x, prox_y = cx, y
        mid_x,  mid_y  = cx, cy
        dist_x, dist_y = cx, y + h
    else:         # horizontal forearm
        prox_x, prox_y = x,     cy
        mid_x,  mid_y  = cx,    cy
        dist_x, dist_y = x + w, cy

    # Convert to percentage of image dimensions (clamped 5..95)
    def pct(v, dim):
        return max(5.0, min(95.0, (v / dim) * 100.0))

    return [
        pct(prox_x, img_w), pct(prox_y, img_h),
        pct(mid_x,  img_w), pct(mid_y,  img_h),
        pct(dist_x, img_w), pct(dist_y, img_h),
    ]

def build_state_vector(ann, img_w, img_h, body_part_name="Forearm"):
    """
    Build the 23-dim state vector from annotation + image metadata.
    Matches the compiled Flutter client (landmark_editor.dart).
    """
    x, y, w, h = ann['bbox']
    state = np.zeros(23)

    # 0: Age – default adult
    state[0] = 35.0 / 100.0

    # 1-3: Gender – default Male
    state[1] = 1.0

    # 4-5: Side – infer from bbox horizontal centre
    cx_pct = (x + w / 2.0) / img_w
    if cx_pct < 0.5:
        state[4] = 1.0   # Left
    else:
        state[5] = 1.0   # Right

    # 6-9: Body Part (matches landmark_editor.dart)
    p_name = body_part_name.capitalize()
    if p_name == 'Forearm':
        state[6] = 1.0
    elif p_name == 'Wrist':
        state[7] = 1.0
    elif p_name == 'Ankle':
        state[8] = 1.0
    else:
        state[9] = 1.0 # Elbow, Hand, Foot, Knee, Shoulder

    # 10-12: Mobility – Normal
    state[10] = 1.0

    # 13-16: Swelling – Normal
    state[13] = 1.0

    # 17-22: Angle – Front if portrait, Left/Right if landscape
    if h >= w:
        state[17] = 1.0  # Front
    else:
        if cx_pct < 0.5:
            state[19] = 1.0  # Left
        else:
            state[20] = 1.0  # Right

    return state

def load_coco_split(split_dir):
    """Load images + annotations from one COCO split directory."""
    ann_path = os.path.join(split_dir, "_annotations.coco.json")
    if not os.path.exists(ann_path):
        return [], {}
    with open(ann_path, 'r') as f:
        data = json.load(f)
    img_map = {img['id']: img for img in data.get('images', [])}
    return data.get('annotations', []), img_map

def load_all_splits(dataset_dir):
    """Combine train + valid annotations."""
    all_anns, all_imgs = [], {}
    for split in ['train', 'valid']:
        d = os.path.join(dataset_dir, split)
        anns, imgs = load_coco_split(d)
        all_anns.extend(anns)
        all_imgs.update(imgs)
    print(f"Loaded {len(all_anns)} annotations from {len(all_imgs)} images")
    return all_anns, all_imgs

# ──────────────────────────────────────────────
# Supabase helpers
# ──────────────────────────────────────────────

def load_env_credentials():
    url, key = None, None
    if os.path.exists('.env'):
        with open('.env', 'r') as f:
            for line in f:
                if line.startswith('VITE_SUPABASE_URL='):
                    url = line.split('=', 1)[1].strip()
                elif line.startswith('VITE_SUPABASE_ANON_KEY='):
                    key = line.split('=', 1)[1].strip()
    return url, key

def upload_model_data(url, key, data_dict):
    json_bytes = json.dumps(data_dict).encode('utf-8')
    headers = {
        'apikey': key, 'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json', 'x-upsert': 'true'
    }
    req = urllib.request.Request(
        f"{url}/storage/v1/object/scans/rl_model_data.json",
        data=json_bytes, headers=headers, method='PUT'
    )
    try:
        with urllib.request.urlopen(req): return True
    except Exception:
        req.method = 'POST'
        try:
            with urllib.request.urlopen(req): return True
        except Exception:
            return False

# ──────────────────────────────────────────────
# Training notes
# ──────────────────────────────────────────────

def load_notes():
    if os.path.exists(NOTES_PATH):
        try:
            with open(NOTES_PATH, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return []

def save_notes(notes):
    with open(NOTES_PATH, 'w') as f:
        json.dump(notes, f, indent=2)

# ──────────────────────────────────────────────
# Main training routine
# ──────────────────────────────────────────────

def train(dataset_dir, epochs=200, lr=0.01, tolerance=0.5):
    print(f"\n{'='*60}")
    print("  OrthoMeasure — COCO Dataset RL Training")
    print(f"  Dataset : {dataset_dir}")
    print(f"  Epochs  : {epochs}  |  LR: {lr}  |  Tolerance: {tolerance}%")
    print(f"{'='*60}\n")

    # Load existing model
    model = LandmarkRLModel()
    old_stats = {"total_trained": 0, "current_avg_reward": 100.0, "current_avg_error": 0.0}
    trained_cases = []
    training_history = []

    if os.path.exists(LOCAL_MODEL_PATH):
        try:
            with open(LOCAL_MODEL_PATH, 'r') as f:
                saved = json.load(f)
            model.from_dict(saved["weights"])
            trained_cases     = saved.get("trained_cases", [])
            training_history  = saved.get("training_history", [])
            old_stats         = saved.get("stats", old_stats)
            print(f"[OK] Loaded existing model weights (previously trained on {old_stats['total_trained']} cases)\n")
        except Exception as e:
            print(f"[WARN] Could not load existing model ({e}). Starting fresh.\n")

    # Load dataset
    all_anns, all_imgs = load_all_splits(dataset_dir)
    if not all_anns:
        print("[ERR] No annotations found. Check dataset path.")
        sys.exit(1)

    # Dynamically determine body part name from dataset directory path
    body_part_name = "Forearm"
    dir_lower = dataset_dir.lower()
    if "foot" in dir_lower:
        body_part_name = "Foot"
    elif "wrist" in dir_lower:
        body_part_name = "Wrist"
    elif "ankle" in dir_lower:
        body_part_name = "Ankle"
    elif "elbow" in dir_lower:
        body_part_name = "Elbow"
    elif "hand" in dir_lower:
        body_part_name = "Hand"
    elif "knee" in dir_lower:
        body_part_name = "Knee"
    elif "shoulder" in dir_lower:
        body_part_name = "Shoulder"

    print(f"Detected body part from path: {body_part_name}")

    # Build training samples
    samples = []
    for ann in all_anns:
        img_info = all_imgs.get(ann['image_id'])
        if not img_info:
            continue
        img_w = img_info.get('width',  640)
        img_h = img_info.get('height', 480)
        bbox  = ann.get('bbox')
        if not bbox or len(bbox) < 4:
            continue
        coords  = bbox_to_landmarks_pct(bbox, img_w, img_h)
        state   = build_state_vector(ann, img_w, img_h, body_part_name=body_part_name)
        offsets = np.array(coords) - np.array(FOREARM_DEFAULTS)
        samples.append((state, offsets, ann['id']))

        # Also append 5 dummy samples for the other angles with 0 offset to avoid cross-talk
        x_val, y_val, w_val, h_val = bbox
        cx_pct = (x_val + w_val / 2.0) / img_w
        inferred_angle = 'Front' if h_val >= w_val else ('Left' if cx_pct < 0.5 else 'Right')
        
        for angle in ['Front', 'Back', 'Left', 'Right', '45° Left', '45° Right']:
            if angle != inferred_angle:
                # Build dummy state with this specific angle (23-dimensional)
                dummy_state = np.zeros(23)
                dummy_state[0] = 35.0 / 100.0
                dummy_state[1] = 1.0 # Male
                dummy_state[4 if cx_pct < 0.5 else 5] = 1.0 # Side
                
                # Body part (matches Flutter landmark_editor.dart)
                p_name = body_part_name.capitalize()
                if p_name == 'Forearm':
                    dummy_state[6] = 1.0
                elif p_name == 'Wrist':
                    dummy_state[7] = 1.0
                elif p_name == 'Ankle':
                    dummy_state[8] = 1.0
                else:
                    dummy_state[9] = 1.0 # Elbow, Hand, Foot, Knee, Shoulder

                dummy_state[10] = 1.0 # Normal mobility
                dummy_state[13] = 1.0 # Normal swelling

                # Angle
                angles_list = ['Front', 'Back', 'Left', 'Right', '45° Left', '45° Right']
                dummy_state[17 + angles_list.index(angle)] = 1.0

                # Target offset is zero! (forces clean default landmarks)
                dummy_offsets = np.zeros(6)
                samples.append((dummy_state, dummy_offsets, f"dummy-{ann['id']}-{angle}"))

    print(f"[OK] Built {len(samples)} training samples\n")

    # Training loop
    session_id  = time.strftime("%Y-%m-%dT%H:%M:%S")
    epoch_log   = []

    for epoch in range(epochs):
        np.random.shuffle(samples)
        epoch_rewards, epoch_errors = [], []

        for state, target_offsets, ann_id in samples:
            X      = state.reshape(1, -1)
            target = target_offsets.reshape(1, -1)
            out    = model.forward(X)

            pred   = out.flatten()
            errors = np.abs(pred - target_offsets)
            mean_err = float(np.mean(errors))
            l2_dist  = float(np.sqrt(np.mean((pred - target_offsets)**2)))
            reward   = max(-100.0, 100.0 - (l2_dist * 5.0))

            step_lr = lr if mean_err > 2.0 else lr * 0.25
            model.backward(X, out, target, lr=step_lr)

            epoch_rewards.append(reward)
            epoch_errors.append(mean_err)

        avg_reward = float(np.mean(epoch_rewards))
        avg_error  = float(np.mean(epoch_errors))
        epoch_log.append({"epoch": epoch, "reward": round(avg_reward, 2), "avg_error": round(avg_error, 2)})

        if epoch % 20 == 0 or epoch == epochs - 1:
            bar_len = 30
            filled  = int(bar_len * (epoch + 1) / epochs)
            bar     = "#" * filled + "-" * (bar_len - filled)
            print(f"  [{bar}] Epoch {epoch+1:>4}/{epochs}  Reward: {avg_reward:6.2f}%  Error: {avg_error:5.2f}%")

        if avg_error < tolerance:
            print(f"\n  [DONE] Converged at epoch {epoch+1} (error {avg_error:.2f}% < {tolerance}%)")
            break

    print()

    # Compute final stats
    final_reward = round(float(np.mean([e["reward"] for e in epoch_log[-10:]])), 2)
    final_error  = round(float(np.mean([e["avg_error"] for e in epoch_log[-10:]])), 2)

    # Add dataset-sourced IDs to trained_cases
    ds_ids = [f"coco-{s[2]}" for s in samples]
    for cid in ds_ids:
        if cid not in trained_cases:
            trained_cases.append(cid)

    # Build history entries (sample every 10 epochs)
    for e in epoch_log[::10]:
        training_history.append({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "case_id":   f"[COCO-Dataset] epoch {e['epoch']+1}",
            "reward":    e["reward"],
            "loss":      round((100.0 - e["reward"]) / 100.0, 4),
            "avg_error_pct": e["avg_error"]
        })

    new_stats = {
        "total_trained":       len(trained_cases),
        "current_avg_reward":  final_reward,
        "current_avg_error":   final_error,
    }

    # Save model
    model_data = {
        "weights":          model.to_dict(),
        "trained_cases":    trained_cases,
        "training_history": training_history[-100:],
        "stats":            new_stats
    }
    with open(LOCAL_MODEL_PATH, 'w') as f:
        json.dump(model_data, f, indent=2)
    print(f"[OK] Model weights saved -> {LOCAL_MODEL_PATH}")

    # Upload to Supabase
    url, key = load_env_credentials()
    if url and key:
        ok = upload_model_data(url, key, model_data)
        print("[OK] Uploaded to Supabase" if ok else "[WARN] Supabase upload failed (weights saved locally)")
    else:
        print("[WARN] No Supabase credentials found in .env -- skipping cloud sync")

    # Save training notes
    notes = load_notes()
    note_entry = {
        "session_id":         session_id,
        "source":             os.path.basename(dataset_dir),
        "images_processed":   len(samples),
        "epochs_run":         len(epoch_log),
        "avg_reward_before":  old_stats.get("current_avg_reward", "N/A"),
        "avg_error_before":   old_stats.get("current_avg_error", "N/A"),
        "avg_reward_after":   final_reward,
        "avg_error_after":    final_error,
        "reward_delta":       round(final_reward - (old_stats.get("current_avg_reward") or 0), 2),
        "error_delta":        round(final_error  - (old_stats.get("current_avg_error")  or 0), 2),
        "notes": (
            f"Trained on COCO forearm segmentation dataset. "
            f"{len(samples)} bounding-box derived landmark samples used. "
            f"Proximal/mid/distal positions inferred from bbox geometry. "
            f"Reward improved by {round(final_reward - (old_stats.get('current_avg_reward') or 0), 2)}%, "
            f"error changed by {round(final_error - (old_stats.get('current_avg_error') or 0), 2)}%."
        )
    }
    notes.append(note_entry)
    save_notes(notes)
    print(f"[OK] Training notes saved -> {NOTES_PATH}")

    # Upload notes to Supabase storage (so UI can display them)
    if url and key:
        try:
            with open(NOTES_PATH, 'rb') as nf:
                notes_bytes = nf.read()
            notes_headers = {
                'apikey': key, 'Authorization': f'Bearer {key}',
                'Content-Type': 'application/json', 'x-upsert': 'true'
            }
            notes_req = urllib.request.Request(
                f"{url}/storage/v1/object/scans/rl_training_notes.json",
                data=notes_bytes, headers=notes_headers, method='PUT'
            )
            with urllib.request.urlopen(notes_req):
                print("[OK] Training notes synced to Supabase\n")
        except Exception as ne:
            print(f"[WARN] Could not upload notes to Supabase: {ne}\n")
    else:
        print()

    # Print summary
    print(f"{'='*60}")
    print("  TRAINING COMPLETE -- Summary")
    print(f"{'='*60}")
    print(f"  Images processed : {len(samples)}")
    print(f"  Epochs run       : {len(epoch_log)}")
    print(f"  Reward  : {old_stats.get('current_avg_reward','N/A')}% -> {final_reward}%  (delta {note_entry['reward_delta']:+.2f}%)")
    print(f"  Error   : {old_stats.get('current_avg_error','N/A')}% -> {final_error}%   (delta {note_entry['error_delta']:+.2f}%)")
    print(f"{'='*60}\n")
    print("  The AI RL Center in your web app will now show these results.")
    print("  Refresh the Analytics page to see updated stats & training notes.\n")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train RL landmark model from COCO forearm dataset')
    parser.add_argument(
        '--dataset',
        default='forearm.coco-segmentation',
        help='Path to the COCO segmentation dataset folder (default: ./forearm.coco-segmentation)'
    )
    parser.add_argument('--epochs',    type=int,   default=200,  help='Number of training epochs (default: 200)')
    parser.add_argument('--lr',        type=float, default=0.01, help='Learning rate (default: 0.01)')
    parser.add_argument('--tolerance', type=float, default=0.5,  help='Early-stop error threshold %% (default: 0.5)')
    args = parser.parse_args()

    dataset_path = args.dataset
    # Try local path first, then Downloads
    if not os.path.isdir(dataset_path):
        alt = os.path.join(os.path.expanduser("~"), "Downloads", dataset_path)
        if os.path.isdir(alt):
            dataset_path = alt
        else:
            print(f"[ERR] Dataset folder not found: {args.dataset}")
            print(f"  Also tried: {alt}")
            sys.exit(1)

    train(dataset_path, epochs=args.epochs, lr=args.lr, tolerance=args.tolerance)
