import os
import sys
import json
import time
import math
import argparse
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
        # He initialization for hidden layers
        self.W1 = np.random.randn(self.input_dim, self.hidden_1) * np.sqrt(2. / self.input_dim)
        self.b1 = np.zeros((1, self.hidden_1))
        self.W2 = np.random.randn(self.hidden_1, self.hidden_2) * np.sqrt(2. / self.hidden_1)
        self.b2 = np.zeros((1, self.hidden_2))
        # Output layer at zero — untrained inputs predict 0 offset (= anatomical default)
        self.W3 = np.zeros((self.hidden_2, self.output_dim))
        self.b3 = np.zeros((1, self.output_dim))
        # Adam optimiser moments (initialised alongside weights)
        self._init_adam()

    def _init_adam(self):
        """Reset first/second moment buffers for Adam."""
        self.mW1 = np.zeros_like(self.W1); self.vW1 = np.zeros_like(self.W1)
        self.mb1 = np.zeros_like(self.b1); self.vb1 = np.zeros_like(self.b1)
        self.mW2 = np.zeros_like(self.W2); self.vW2 = np.zeros_like(self.W2)
        self.mb2 = np.zeros_like(self.b2); self.vb2 = np.zeros_like(self.b2)
        self.mW3 = np.zeros_like(self.W3); self.vW3 = np.zeros_like(self.W3)
        self.mb3 = np.zeros_like(self.b3); self.vb3 = np.zeros_like(self.b3)
        self.adam_t = 0  # global step counter

    def forward(self, X):
        self.h1 = np.maximum(0, np.dot(X, self.W1) + self.b1)  # ReLU
        self.h2 = np.maximum(0, np.dot(self.h1, self.W2) + self.b2)  # ReLU
        return np.dot(self.h2, self.W3) + self.b3

    def backward(self, X, out, target, lr=0.001):
        """Adam-based gradient update. lr is the base learning rate."""
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

        # Very small L2 to prevent exploding weights without crushing signal
        l2_lambda = 0.0001
        dW3 += l2_lambda * self.W3
        dW2 += l2_lambda * self.W2
        dW1 += l2_lambda * self.W1

        # Gradient clip (prevent extreme spikes in early epochs)
        for grad in [dW1, db1, dW2, db2, dW3, db3]:
            np.clip(grad, -5.0, 5.0, out=grad)

        # Adam update (beta1=0.9, beta2=0.999, eps=1e-8)
        self.adam_t += 1
        t = self.adam_t
        b1, b2, eps = 0.9, 0.999, 1e-8

        def adam_step(param, grad, m, v):
            m[:] = b1 * m + (1 - b1) * grad
            v[:] = b2 * v + (1 - b2) * (grad ** 2)
            m_hat = m / (1 - b1 ** t)
            v_hat = v / (1 - b2 ** t)
            param -= lr * m_hat / (np.sqrt(v_hat) + eps)

        adam_step(self.W1, dW1, self.mW1, self.vW1)
        adam_step(self.b1, db1, self.mb1, self.vb1)
        adam_step(self.W2, dW2, self.mW2, self.vW2)
        adam_step(self.b2, db2, self.mb2, self.vb2)
        adam_step(self.W3, dW3, self.mW3, self.vW3)
        adam_step(self.b3, db3, self.mb3, self.vb3)

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
        # Re-init Adam moments to match loaded weight shapes
        self._init_adam()

# Helper to resolve default starting coordinates for a body part
def get_default_landmarks(body_part):
    # [proximal_x, proximal_y, mid_x, mid_y, distal_x, distal_y]
    DEFAULTS = {
        'Forearm':  [50.0, 18.0, 50.0, 50.0, 50.0, 82.0],
        'Wrist':    [50.0, 25.0, 50.0, 50.0, 50.0, 75.0],
        'Elbow':    [50.0, 25.0, 50.0, 52.0, 50.0, 75.0],
        'Hand':     [50.0, 20.0, 50.0, 50.0, 50.0, 80.0],
        'Ankle':    [50.0, 22.0, 50.0, 62.0, 50.0, 82.0],
        'Foot':     [50.0, 18.0, 50.0, 50.0, 50.0, 82.0],
        'Knee':     [50.0, 18.0, 50.0, 50.0, 50.0, 82.0],
        'Shoulder': [50.0, 20.0, 50.0, 50.0, 50.0, 80.0],
    }
    return DEFAULTS.get(body_part, DEFAULTS['Forearm'])

# Build State Vector from Patient case profile + Image view angle
# State is 23 dimensions:
#   0       : age (normalised)
#   1-3     : gender (M, F, Other)
#   4-5     : side (Left, Right)
#   6-9     : body part (Forearm, Wrist, Ankle, Elbow/Other)
#   10-12   : mobility (Normal, Limited, None)
#   13-16   : swelling (Normal, Mild, Moderate, Severe)
#   17-22   : view angle (Front, Back, Left, Right, 45°L, 45°R)
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

    # 6-9: Body Part (matches Flutter landmark_editor.dart)
    part = case.get('body_part', 'Forearm')
    if part == 'Forearm':
        state[6] = 1.0
    elif part == 'Wrist':
        state[7] = 1.0
    elif part == 'Ankle':
        state[8] = 1.0
    else:
        state[9] = 1.0 # Elbow, Hand, Foot, Knee, Shoulder

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

    # 17-22: Angle (6 views)
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

# Approximate adult baselines (cm)
def get_default_measurements(body_part):
    DEFAULTS = {
        'Forearm': {
            'total length':        25.0,
            'proximal width':       9.0,
            'distal width':         6.5,
            'mid circumference':   22.8,
            'wrist circumference': 16.5
        },
        'Wrist': {
            'total length':        12.0,
            'proximal width':       6.5,
            'distal width':         5.0,
            'mid circumference':   16.5,
            'wrist circumference': 16.5
        },
        'Elbow': {
            'total length':        14.0,
            'proximal width':      10.5,
            'distal width':         8.5,
            'mid circumference':   28.6,
            'wrist circumference': 22.4
        },
        'Hand': {
            'total length':        18.0,
            'proximal width':       7.0,
            'distal width':         9.0,
            'mid circumference':   19.5,
            'wrist circumference': 16.5
        },
        'Ankle': {
            'total length':        20.0,
            'proximal width':      10.0,
            'distal width':         8.0,
            'mid circumference':   25.0,
            'wrist circumference': 22.0
        },
        'Foot': {
            'total length':        22.0,
            'proximal width':       9.5,
            'distal width':        10.5,
            'mid circumference':   22.0,
            'wrist circumference': 24.0
        },
        'Knee': {
            'total length':        25.0,
            'proximal width':      14.0,
            'distal width':        11.5,
            'mid circumference':   38.0,
            'wrist circumference': 31.0
        },
        'Shoulder': {
            'total length':        20.0,
            'proximal width':      13.0,
            'distal width':        11.0,
            'mid circumference':   35.0,
            'wrist circumference': 29.0
        },
    }
    return DEFAULTS.get(body_part, DEFAULTS['Forearm'])

def adjust_targets_for_manual_measurements(coords, manual_measurements, body_part):
    if not manual_measurements:
        return coords
        
    defaults = get_default_measurements(body_part)
    new_coords = list(coords)
    
    # [px, py, mx, my, dx, dy] = [0, 1, 2, 3, 4, 5]
    
    # 1. Total Length (changes distal Y)
    length_meas = next((m for m in manual_measurements if 'length' in m.get('key', '').lower()), None)
    if length_meas and length_meas.get('manualValue'):
        try:
            actual_val = float(length_meas['manualValue'])
            default_val = defaults.get('total length', 25.0)
            ratio = actual_val / default_val
            base_dist = 64.0 # 82 - 18
            target_dist = base_dist * ratio
            new_coords[5] = new_coords[1] + target_dist
        except ValueError:
            pass
            
    # 2. Proximal Width (changes proximal X)
    prox_meas = next((m for m in manual_measurements if 'proximal width' in m.get('key', '').lower()), None)
    if prox_meas and prox_meas.get('manualValue'):
        try:
            actual_val = float(prox_meas['manualValue'])
            default_val = defaults.get('proximal width', 9.0)
            ratio = actual_val / default_val
            dx = (ratio * 25.0) - 25.0
            # Base is 50. We shift it by dx. Let's say right shift:
            new_coords[0] = 50.0 + dx
        except ValueError:
            pass

    # 3. Distal Width (changes distal X)
    dist_meas = next((m for m in manual_measurements if 'distal width' in m.get('key', '').lower()), None)
    if dist_meas and dist_meas.get('manualValue'):
        try:
            actual_val = float(dist_meas['manualValue'])
            default_val = defaults.get('distal width', 6.5)
            ratio = actual_val / default_val
            dx = (ratio * 25.0) - 25.0
            new_coords[4] = 50.0 + dx
        except ValueError:
            pass
            
    return new_coords

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

    def train_on_case(self, case, epoch_log_only=False):
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
                
            # Use manual measurements to override targets if present
            measurements = case.get('measurements', [])
            final_coords = adjust_targets_for_manual_measurements(doctor_coords, measurements, body_part)
                
            # Inputs/Outputs
            X = build_state_vector(case, angle).reshape(1, -1)
            target_offsets = np.array(final_coords) - np.array(default_landmarks)
            
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
                
            # Log history less aggressively
            if len(self.training_history) < 100 or epoch_log_only:
                log_entry = {
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "case_id": case_id,
                    "reward": round(float(avg_reward), 2),
                    "loss": round(float(avg_loss), 4),
                    "avg_error_pct": round(float(avg_err), 2)
                }
                self.training_history.append(log_entry)
            
            # Recompute global stats
            if len(self.training_history) > 0:
                all_rewards = [h["reward"] for h in self.training_history[-100:]]
                all_errors = [h["avg_error_pct"] for h in self.training_history[-100:]]
            else:
                all_rewards = [avg_reward]
                all_errors = [avg_err]
                
            self.stats = {
                "total_trained": len(self.trained_cases),
                "current_avg_reward": round(float(np.mean(all_rewards)), 2),
                "current_avg_error": round(float(np.mean(all_errors)), 2)
            }
            return True, avg_err
        return False, 0.0

    def train_all_approved(self):
        print("Querying Supabase for approved cases to train the model...")
        cases = fetch_cases(self.url, self.key)
        approved_cases = [c for c in cases if c.get('status') == 'approved']
        print(f"Found {len(approved_cases)} approved cases in database.")
        
        if not approved_cases:
            print("No cases with completed landmark mappings were available for training.")
            return

        trained_count = 0
        epochs = 1000
        tolerance = 0.5 # Stop if average error % is below 0.5%
        
        for epoch in range(epochs):
            epoch_errors = []
            trained_in_epoch = False
            for case in approved_cases:
                # We train on all approved cases to refine model
                success, err = self.train_on_case(case, epoch_log_only=(epoch % 50 != 0))
                if success:
                    epoch_errors.append(err)
                    trained_in_epoch = True
                    if epoch == 0:
                        trained_count += 1
            
            if not trained_in_epoch:
                break
                
            # Check convergence
            current_error = np.mean(epoch_errors) if epoch_errors else 100.0
            if epoch % 10 == 0:
                print(f"Epoch {epoch}: current_avg_error = {current_error:.2f}%")
                
            if current_error < tolerance:
                print(f"Converged at epoch {epoch} with error {current_error:.2f}%")
                break
                
        if trained_count > 0:
            self.save_model()
            print(f"Model training cycle complete. Trained on {trained_count} cases.")
        else:
            print("No new training happened.")

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
    parser = argparse.ArgumentParser(description='RL Landmark Model Manager')
    parser.add_argument('--daemon', action='store_true', help='Run in daemon mode')
    parser.add_argument('--train-all', action='store_true', help='Train on all approved cases in Supabase')
    parser.add_argument('--reset', action='store_true', help='Reset weights using He initialization')
    args = parser.parse_args()
    
    url, key = load_env_credentials()
    if not url or not key:
        print("Error: Could not load VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY from .env file.")
        sys.exit(1)
        
    manager = ModelManager(url, key)
    
    if args.reset:
        print("Resetting model parameters to He initialization...")
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
    
    if args.train_all:
        manager.train_all_approved()
        
    elif args.daemon:
        # Force a pre-training check of all approved cases on boot
        manager.train_all_approved()
        manager.run_daemon()
        
    elif not args.reset:
        print("Usage: python rl_agent.py [--train-all | --daemon | --reset]")
