import os
import re
import sys
import json
import time
import math
import urllib.request
import numpy as np

# Configuration
LOCAL_MODEL_PATH = "rl_model_data.json"
POLL_INTERVAL_SECONDS = 10

class LandmarkRLModel:
    def __init__(self, input_dim=23, hidden_1=32, hidden_2=16, output_dim=6):
        self.input_dim = input_dim
        self.hidden_1 = hidden_1
        self.hidden_2 = hidden_2
        self.output_dim = output_dim
        self.reset_weights()

    def reset_weights(self):
        # Small weights: starts near zero offsets (relying on default fallback)
        self.W1 = np.random.randn(self.input_dim, self.hidden_1) * 0.01
        self.b1 = np.zeros((1, self.hidden_1))
        self.W2 = np.random.randn(self.hidden_1, self.hidden_2) * 0.01
        self.b2 = np.zeros((1, self.hidden_2))
        self.W3 = np.random.randn(self.hidden_2, self.output_dim) * 0.01
        self.b3 = np.zeros((1, self.output_dim))

    def forward(self, X):
        self.h1 = np.maximum(0, np.dot(X, self.W1) + self.b1) # ReLU
        self.h2 = np.maximum(0, np.dot(self.h1, self.W2) + self.b2) # ReLU
        out = np.dot(self.h2, self.W3) + self.b3
        return out

    def backward(self, X, out, target, lr=0.02):
        N = X.shape[0]
        grad_out = (out - target) / N
        
        dW3 = np.dot(self.h2.T, grad_out)
        db3 = np.sum(grad_out, axis=0, keepdims=True)
        
        grad_h2 = np.dot(grad_out, self.W3.T)
        grad_h2[self.h2 <= 0] = 0
        
        dW2 = np.dot(self.h1.T, grad_h2)
        db2 = np.sum(grad_h2, axis=0, keepdims=True)
        
        grad_h1 = np.dot(grad_h2, self.W2.T)
        grad_h1[self.h1 <= 0] = 0
        
        dW1 = np.dot(X.T, grad_h1)
        db1 = np.sum(grad_h1, axis=0, keepdims=True)
        
        # Gradient clip
        for grad in [dW1, db1, dW2, db2, dW3, db3]:
            np.clip(grad, -10.0, 10.0, out=grad)
            
        self.W1 -= lr * dW1
        self.b1 -= lr * db1
        self.W2 -= lr * dW2
        self.b2 -= lr * db2
        self.W3 -= lr * dW3
        self.b3 -= lr * db3

    def to_dict(self):
        return {
            "W1": self.W1.tolist(),
            "b1": self.b1.tolist(),
            "W2": self.W2.tolist(),
            "b2": self.b2.tolist(),
            "W3": self.W3.tolist(),
            "b3": self.b3.tolist()
        }

    def from_dict(self, d):
        self.W1 = np.array(d["W1"])
        self.b1 = np.array(d["b1"])
        self.W2 = np.array(d["W2"])
        self.b2 = np.array(d["b2"])
        self.W3 = np.array(d["W3"])
        self.b3 = np.array(d["b3"])

# Helper to resolve default starting coordinates for a body part
def get_default_landmarks(body_part):
    if body_part == 'Forearm':
        return [50.0, 18.0, 50.0, 50.0, 50.0, 82.0]
    elif body_part == 'Wrist':
        return [50.0, 25.0, 50.0, 50.0, 50.0, 75.0]
    elif body_part == 'Ankle':
        return [50.0, 22.0, 50.0, 62.0, 50.0, 82.0]
    else: # Elbow / other
        return [50.0, 25.0, 50.0, 52.0, 50.0, 75.0]

# Build State Vector from Patient case profile + Image view angle
def build_state_vector(case, angle):
    state = np.zeros(23)
    
    # 0: Age (normalized)
    age = case.get('patient_age', 35)
    if age is None: age = 35
    state[0] = float(age) / 100.0
    
    # 1-3: Gender (M, F, Other)
    gender = case.get('patient_gender', 'M')
    if gender == 'M': state[1] = 1.0
    elif gender == 'F': state[2] = 1.0
    else: state[3] = 1.0
    
    # 4-5: Side (Left, Right)
    side = case.get('side', 'Left')
    if side == 'Left': state[4] = 1.0
    else: state[5] = 1.0
    
    # 6-9: Body Part (Forearm, Wrist, Ankle, Elbow)
    part = case.get('body_part', 'Forearm')
    if part == 'Forearm': state[6] = 1.0
    elif part == 'Wrist': state[7] = 1.0
    elif part == 'Ankle': state[8] = 1.0
    else: state[9] = 1.0
    
    # 10-12: Mobility (Normal, Limited, None)
    mobility = case.get('mobility_status', 'Normal')
    if mobility == 'Normal': state[10] = 1.0
    elif mobility == 'Limited': state[11] = 1.0
    else: state[12] = 1.0
    
    # 13-16: Swelling (Normal, Mild, Moderate, Severe)
    swelling = case.get('swelling_status', 'Normal')
    if swelling == 'Normal': state[13] = 1.0
    elif swelling == 'Mild': state[14] = 1.0
    elif swelling == 'Moderate': state[15] = 1.0
    else: state[16] = 1.0
    
    # 17-22: Angle
    angles_list = ['Front', 'Back', 'Left', 'Right', '45° Left', '45° Right']
    if angle in angles_list:
        idx = angles_list.index(angle)
        state[17 + idx] = 1.0
        
    return state

# Parse landmarks from case image structure
def get_landmarks_coordinates(landmarks_dict):
    try:
        # Expected order: [proximal_x, proximal_y, mid_x, mid_y, distal_x, distal_y]
        px = float(landmarks_dict['proximal']['x'])
        py = float(landmarks_dict['proximal']['y'])
        mx = float(landmarks_dict['mid']['x'])
        my = float(landmarks_dict['mid']['y'])
        dx = float(landmarks_dict['distal']['x'])
        dy = float(landmarks_dict['distal']['y'])
        return [px, py, mx, my, dx, dy]
    except Exception:
        return None

# Load credentials from .env
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

# REST callers
def fetch_cases(url, key):
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    req = urllib.request.Request(f"{url}/rest/v1/ortho_cases", headers=headers)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

def upload_model_data(url, key, data_dict):
    json_bytes = json.dumps(data_dict).encode('utf-8')
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'x-upsert': 'true'
    }
    # Upload to storage/v1/object/scans/rl_model_data.json
    req = urllib.request.Request(
        f"{url}/storage/v1/object/scans/rl_model_data.json",
        data=json_bytes,
        headers=headers,
        method='PUT'
    )
    try:
        with urllib.request.urlopen(req) as r:
            return True
    except Exception as e:
        # Fallback to POST
        req.method = 'POST'
        try:
            with urllib.request.urlopen(req) as r:
                return True
        except Exception:
            return False

# Main model manager
class ModelManager:
    def __init__(self, url, key):
        self.url = url
        self.key = key
        self.model = LandmarkRLModel()
        self.trained_cases = []
        self.training_history = []
        self.stats = {
            "total_trained": 0,
            "current_avg_reward": 100.0,
            "current_avg_error": 0.0
        }
        self.load_model()

    def load_model(self):
        # Try local first
        if os.path.exists(LOCAL_MODEL_PATH):
            try:
                with open(LOCAL_MODEL_PATH, 'r') as f:
                    data = json.load(f)
                    self.model.from_dict(data["weights"])
                    self.trained_cases = data.get("trained_cases", [])
                    self.training_history = data.get("training_history", [])
                    self.stats = data.get("stats", self.stats)
                    print(f"Loaded existing model state. Total cases trained so far: {len(self.trained_cases)}")
                    return
            except Exception as e:
                print("Failed to load local model, starting fresh:", e)
        print("Initialized fresh reinforcement learning landmark model.")

    def save_model(self):
        data = {
            "weights": self.model.to_dict(),
            "trained_cases": self.trained_cases,
            "training_history": self.training_history[-100:], # Cap history size
            "stats": self.stats
        }
        try:
            with open(LOCAL_MODEL_PATH, 'w') as f:
                json.dump(data, f, indent=2)
            # Sync to Supabase
            success = upload_model_data(self.url, self.key, data)
            if success:
                print("Model parameters successfully synchronized to Supabase Cloud.")
            else:
                print("Warning: Cloud synchronization failed. Weights saved locally.")
        except Exception as e:
            print("Error saving model state:", e)

    def train_on_case(self, case):
        case_id = case.get('id')
        body_part = case.get('body_part', 'Forearm')
        images = case.get('images', [])
        
        default_landmarks = get_default_landmarks(body_part)
        trained_any_image = False
        
        case_rewards = []
        case_errors = []
        case_losses = []
        
        # Loop through images and train online
        for img in images:
            angle = img.get('angle')
            landmarks = img.get('landmarks')
            if not landmarks:
                continue
                
            doctor_coords = get_landmarks_coordinates(landmarks)
            if not doctor_coords:
                continue
                
            # Inputs/Outputs
            X = build_state_vector(case, angle).reshape(1, -1)
            target_offsets = np.array(doctor_coords) - np.array(default_landmarks)
            
            # Predict
            pred_offsets = self.model.forward(X).flatten()
            
            # Loss and Backprop
            target = target_offsets.reshape(1, -1)
            out = pred_offsets.reshape(1, -1)
            
            # Distance error (in percent scale)
            errors = np.abs(pred_offsets - target_offsets)
            mean_error = np.mean(errors)
            
            # Reward: 100.0 - (L2-norm * multiplier)
            # Maximum reward is 100 when predicted matches doctor adjustments perfectly.
            l2_dist = np.sqrt(np.mean((pred_offsets - target_offsets)**2))
            reward = max(-100.0, 100.0 - (l2_dist * 5.0))
            
            loss = 0.5 * np.sum((pred_offsets - target_offsets)**2)
            
            # Model parameter update (online reinforcement/fine-tuning)
            # Higher learning rate if the displacement is significant
            lr = 0.02 if mean_error > 2.0 else 0.005
            self.model.backward(X, out, target, lr=lr)
            
            case_rewards.append(reward)
            case_errors.append(mean_error)
            case_losses.append(loss)
            trained_any_image = True
            
        if trained_any_image:
            avg_reward = np.mean(case_rewards)
            avg_err = np.mean(case_errors)
            avg_loss = np.mean(case_losses)
            
            if case_id not in self.trained_cases:
                self.trained_cases.append(case_id)
                
            # Log history
            log_entry = {
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "case_id": case_id,
                "reward": round(float(avg_reward), 2),
                "loss": round(float(avg_loss), 4),
                "avg_error_pct": round(float(avg_err), 2)
            }
            self.training_history.append(log_entry)
            
            # Recompute global stats
            all_rewards = [h["reward"] for h in self.training_history]
            all_errors = [h["avg_error_pct"] for h in self.training_history]
            self.stats = {
                "total_trained": len(self.trained_cases),
                "current_avg_reward": round(float(np.mean(all_rewards)), 2) if all_rewards else 100.0,
                "current_avg_error": round(float(np.mean(all_errors)), 2) if all_errors else 0.0
            }
            
            print(f"[{time.strftime('%H:%M:%S')}] Trained on Case {case_id} ({body_part}). Reward: {log_entry['reward']} | Error: {log_entry['avg_error_pct']}%")
            return True
        return False

    def train_all_approved(self):
        print("Querying Supabase for approved cases to train the model...")
        cases = fetch_cases(self.url, self.key)
        approved_cases = [c for c in cases if c.get('status') == 'approved']
        print(f"Found {len(approved_cases)} approved cases in database.")
        
        trained_count = 0
        for case in approved_cases:
            # We train on all approved cases to refine model, even if trained before (epochs)
            success = self.train_on_case(case)
            if success:
                trained_count += 1
                
        if trained_count > 0:
            self.save_model()
            print(f"Model training cycle complete. Trained on {trained_count} cases.")
        else:
            print("No cases with completed landmark mappings were available for training.")

    def run_daemon(self):
        print(f"AI RL Agent Daemon started. Listening for approved cases every {POLL_INTERVAL_SECONDS} seconds...")
        while True:
            try:
                cases = fetch_cases(self.url, self.key)
                approved_cases = [c for c in cases if c.get('status') == 'approved']
                
                # Check for new approved cases not in self.trained_cases
                new_cases = [c for c in approved_cases if c.get('id') not in self.trained_cases]
                
                if new_cases:
                    print(f"Detected {len(new_cases)} new approved cases! Starting online training...")
                    for case in new_cases:
                        self.train_on_case(case)
                    self.save_model()
                
            except Exception as e:
                print("Daemon loop exception occurred:", e)
            time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == '__main__':
    # Parse arguments
    url, key = load_env_credentials()
    if not url or not key:
        print("Error: Could not load VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY from .env file.")
        sys.exit(1)
        
    cmd = "--train-all"
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        
    manager = ModelManager(url, key)
    
    if cmd == "--reset":
        print("Resetting model parameters...")
        manager.model.reset_weights()
        manager.trained_cases = []
        manager.training_history = []
        manager.stats = {
            "total_trained": 0,
            "current_avg_reward": 100.0,
            "current_avg_error": 0.0
        }
        manager.save_model()
        print("Model parameters reset successfully.")
        
    elif cmd == "--daemon":
        # Force a pre-training check of all approved cases on boot
        manager.train_all_approved()
        manager.run_daemon()
        
    elif cmd == "--train-all":
        manager.train_all_approved()
        
    else:
        print(f"Unknown command: {cmd}")
        print("Usage: python rl_agent.py [--train-all | --daemon | --reset]")
