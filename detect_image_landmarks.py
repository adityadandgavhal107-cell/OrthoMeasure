"""
detect_image_landmarks.py
─────────────────────────
Runs Computer Vision (MediaPipe Pose & Hands) to extract precise anatomical
landmarks from forearm and foot scan images, with tabular RL model fallback.

Supports:
  1. Local image file prediction:
     py -3 detect_image_landmarks.py --image path/to/limb.jpg --body-part Forearm
  
  2. Cloud integration mode (daemon):
     py -3 detect_image_landmarks.py --supabase-sync

Libraries used: OpenCV, MediaPipe.
"""

import os, sys, json, time, argparse, urllib.request
import numpy as np
import cv2
import mediapipe as mp

# Force UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ── Supabase Credentials ──────────────────────────────────────────────────────

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

# ── MediaPipe Joint Detection ─────────────────────────────────────────────────

def run_mediapipe_detection(img_bytes, body_part, side='Left'):
    """
    Analyzes an image and returns normalized coords (0..100) for
    [proximal_x, proximal_y, mid_x, mid_y, distal_x, distal_y] using MediaPipe.
    """
    # Load image from bytes
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None

    h, w, _ = img.shape
    # Convert BGR to RGB
    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    mp_pose = mp.solutions.pose
    with mp_pose.Pose(static_image_mode=True, min_detection_confidence=0.4) as pose:
        results = pose.process(rgb_img)

        if not results.pose_landmarks:
            return None

        landmarks = results.pose_landmarks.landmark

        # Select indices based on Left/Right side
        is_left = side.lower() == 'left'
        
        # Mapping indices
        shoulder_idx = mp_pose.PoseLandmark.LEFT_SHOULDER if is_left else mp_pose.PoseLandmark.RIGHT_SHOULDER
        elbow_idx    = mp_pose.PoseLandmark.LEFT_ELBOW    if is_left else mp_pose.PoseLandmark.RIGHT_ELBOW
        wrist_idx    = mp_pose.PoseLandmark.LEFT_WRIST    if is_left else mp_pose.PoseLandmark.RIGHT_WRIST
        hip_idx      = mp_pose.PoseLandmark.LEFT_HIP      if is_left else mp_pose.PoseLandmark.RIGHT_HIP
        knee_idx     = mp_pose.PoseLandmark.LEFT_KNEE     if is_left else mp_pose.PoseLandmark.RIGHT_KNEE
        ankle_idx    = mp_pose.PoseLandmark.LEFT_ANKLE    if is_left else mp_pose.PoseLandmark.RIGHT_ANKLE
        heel_idx     = mp_pose.PoseLandmark.LEFT_HEEL     if is_left else mp_pose.PoseLandmark.RIGHT_HEEL

        def get_pt(idx):
            lm = landmarks[idx]
            return lm.x * 100.0, lm.y * 100.0

        bp = body_part.lower()

        if 'forearm' in bp or 'elbow' in bp or 'wrist' in bp:
            # Proximal = Elbow, Distal = Wrist, Mid = Forearm center
            px, py = get_pt(elbow_idx)
            dx, dy = get_pt(wrist_idx)
            mx, my = (px + dx) / 2.0, (py + dy) / 2.0
            return [px, py, mx, my, dx, dy]

        elif 'foot' in bp or 'ankle' in bp or 'knee' in bp:
            # Proximal = Knee, Mid = Ankle, Distal = Heel/Toes
            px, py = get_pt(knee_idx)
            mx, my = get_pt(ankle_idx)
            dx, dy = get_pt(heel_idx)
            return [px, py, mx, my, dx, dy]

        elif 'shoulder' in bp:
            # Proximal = Shoulder, Distal = Elbow, Mid = Center
            px, py = get_pt(shoulder_idx)
            dx, dy = get_pt(elbow_idx)
            mx, my = (px + dx) / 2.0, (py + dy) / 2.0
            return [px, py, mx, my, dx, dy]

    return None

# ── Tabular RL Model Fallback ─────────────────────────────────────────────────

class LandmarkRLModel:
    def __init__(self, weights_dict):
        self.W1 = np.array(weights_dict["W1"])
        self.b1 = np.array(weights_dict["b1"])
        self.W2 = np.array(weights_dict["W2"])
        self.b2 = np.array(weights_dict["b2"])
        self.W3 = np.array(weights_dict["W3"])
        self.b3 = np.array(weights_dict["b3"])

    def forward(self, X):
        h1 = np.maximum(0, np.dot(X, self.W1) + self.b1)
        h2 = np.maximum(0, np.dot(h1, self.W2) + self.b2)
        return np.dot(h2, self.W3) + self.b3

def run_rl_inference(case, angle):
    """Fallback to the RL Tabular weights if MediaPipe finds no person/pose."""
    weights_path = "rl_model_data.json"
    DEFAULTS = [50.0, 18.0, 50.0, 50.0, 50.0, 82.0]
    
    if not os.path.exists(weights_path):
        return DEFAULTS

    try:
        with open(weights_path) as f:
            w_data = json.load(f)
        model = LandmarkRLModel(w_data["weights"])
        
        # Build 23-dim state vector (matches landmark_editor.dart)
        state = np.zeros(23)
        state[0] = float(case.get('patient_age', 35)) / 100.0
        
        gender = case.get('patient_gender', 'M')
        state[1 if gender == 'M' else (2 if gender == 'F' else 3)] = 1.0
        state[4 if case.get('side') == 'Left' else 5] = 1.0
        
        part = case.get('body_part', 'Forearm')
        if part == 'Forearm':
            state[6] = 1.0
        elif part == 'Wrist':
            state[7] = 1.0
        elif part == 'Ankle':
            state[8] = 1.0
        else:
            state[9] = 1.0 # Elbow, Hand, Foot, Knee, Shoulder
        
        mobility = case.get('mobility_status', 'Normal')
        state[10 if mobility == 'Normal' else (11 if mobility == 'Limited' else 12)] = 1.0
        
        swelling = case.get('swelling_status', 'Normal')
        state[13 if swelling == 'Normal' else (14 if swelling == 'Mild' else (15 if swelling == 'Moderate' else 16))] = 1.0
        
        angles_list = ['Front', 'Back', 'Left', 'Right', '45° Left', '45° Right']
        if angle in angles_list:
            state[17 + angles_list.index(angle)] = 1.0
            
        pred = model.forward(state.reshape(1, -1)).flatten()
        return (np.array(DEFAULTS) + pred).tolist()
    except Exception:
        return DEFAULTS

# ── Supabase DB updates ────────────────────────────────────────────────────────

def fetch_pending_scans(url, key):
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    # Fetch cases that have status 'pending' (waiting for scan or scan uploaded but not annotated)
    req = urllib.request.Request(f"{url}/rest/v1/ortho_cases?status=eq.pending", headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())
    except Exception:
        return []

def update_case_images(url, key, case_id, images):
    json_bytes = json.dumps({"images": images}).encode('utf-8')
    headers = {
        'apikey': key, 'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json', 'Prefer': 'return=representation'
    }
    req = urllib.request.Request(
        f"{url}/rest/v1/ortho_cases?id=eq.{case_id}",
        data=json_bytes, headers=headers, method='PATCH'
    )
    try:
        with urllib.request.urlopen(req):
            return True
    except Exception as e:
        print(f"Failed to update case database: {e}")
        return False

# ── Main Run Modes ────────────────────────────────────────────────────────────

def process_case_scans(case, url, key):
    case_id   = case.get('id')
    body_part = case.get('body_part', 'Forearm')
    side      = case.get('side', 'Left')
    images    = case.get('images', [])

    updated = False
    for img in images:
        # Process if image has no landmarks or needs initial predictions
        if not img.get('landmarks'):
            img_url = img.get('url')
            if not img_url:
                continue

            print(f"  Processing scan image: {img_url}...")
            try:
                # Download image
                req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as response:
                    img_bytes = response.read()

                # 1. Try Computer Vision (MediaPipe)
                coords = run_mediapipe_detection(img_bytes, body_part, side)
                
                if coords:
                    print("  [OK] Computer Vision detected joint landmarks successfully!")
                else:
                    # 2. Fallback to Tabular RL Model
                    print("  [WARN] MediaPipe detection failed (no person visible). Falling back to RL Model Prior...")
                    coords = run_rl_inference(case, img.get('angle', 'Front'))

                # Construct landmark output structure
                img['landmarks'] = {
                    "proximal": {"x": round(coords[0], 1), "y": round(coords[1], 1)},
                    "mid":      {"x": round(coords[2], 1), "y": round(coords[3], 1)},
                    "distal":   {"x": round(coords[4], 1), "y": round(coords[5], 1)}
                }
                updated = True
            except Exception as e:
                print(f"  [ERR] Failed to process image {img_url}: {e}")

    if updated:
        ok = update_case_images(url, key, case_id, images)
        if ok:
            print(f"  [OK] Saved predicted landmarks to case {case_id} in Supabase Cloud.")

def daemon_sync():
    url, key = load_env_credentials()
    if not url or not key:
        print("[ERR] Could not load Supabase credentials from .env")
        sys.exit(1)

    print(f"\n{'='*70}")
    print("  OrthoMeasure -- Automated Computer Vision Landmark Daemon")
    print("  Status: Active and listening for new scans...")
    print(f"{'='*70}\n")

    while True:
        try:
            cases = fetch_pending_scans(url, key)
            for case in cases:
                images = case.get('images', [])
                # Check if any image lacks landmarks
                if any(not img.get('landmarks') for img in images):
                    print(f"Detected case {case.get('id')} with un-annotated scans. Processing...")
                    process_case_scans(case, url, key)
        except Exception as e:
            print(f"Daemon exception: {e}")
        time.sleep(5)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Automated anatomical landmark detector')
    parser.add_argument('--image', help='Path to local image file to detect landmarks on')
    parser.add_argument('--body-part', default='Forearm', help='Body part (Forearm, Foot, etc.)')
    parser.add_argument('--side', default='Left', help='Side (Left or Right)')
    parser.add_argument('--supabase-sync', action='store_true', help='Run as a cloud sync daemon')
    args = parser.parse_args()

    if args.supabase_sync or (len(sys.argv) == 2 and sys.argv[1] == '--supabase-sync'):
        daemon_sync()
    elif args.image:
        if not os.path.exists(args.image):
            print(f"[ERR] Image not found: {args.image}")
            sys.exit(1)
        with open(args.image, 'rb') as f:
            img_bytes = f.read()
        coords = run_mediapipe_detection(img_bytes, args.body_part, args.side)
        if coords:
            print(json.dumps({
                "proximal": {"x": round(coords[0], 1), "y": round(coords[1], 1)},
                "mid":      {"x": round(coords[2], 1), "y": round(coords[3], 1)},
                "distal":   {"x": round(coords[4], 1), "y": round(coords[5], 1)}
            }, indent=2))
        else:
            print("[WARN] Joint detection failed. Try standing further back or showing the entire limb clearly.")
    else:
        print("Usage:")
        print("  py -3 detect_image_landmarks.py --supabase-sync")
        print("  py -3 detect_image_landmarks.py --image path/to/image.jpg --body-part Forearm")
