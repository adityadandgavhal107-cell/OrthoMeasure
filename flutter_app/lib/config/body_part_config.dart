import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Silhouette shape hint used by BodyPartGuidePainter
// ─────────────────────────────────────────────────────────────────────────────
enum SilhouetteShape {
  verticalLimb,   // Forearm, lower-leg, upper-arm, shin
  narrowLimb,     // Wrist, finger section
  footShaped,     // Foot — wider at toe end, narrow at heel
  handShaped,     // Hand — wide palm, narrow wrist
  kneeShaped,     // Knee — symmetric bulge in centre
}

// ─────────────────────────────────────────────────────────────────────────────
// A single landmark zone displayed inside the guide overlay
// ─────────────────────────────────────────────────────────────────────────────
class LandmarkZone {
  final double yFraction; // 0.0 (top) to 1.0 (bottom) within the guide box
  final String label;     // Label shown on the guide overlay dot

  const LandmarkZone({required this.yFraction, required this.label});
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-angle scan instructions
// ─────────────────────────────────────────────────────────────────────────────
class AngleInstruction {
  final String title;
  final String body;

  const AngleInstruction({required this.title, required this.body});
}

// ─────────────────────────────────────────────────────────────────────────────
// Full config for one body part
// ─────────────────────────────────────────────────────────────────────────────
class BodyPartConfig {
  /// Three overlay landmark zones (proximal → distal)
  final List<LandmarkZone> zones;

  /// ML Kit pose landmark types required for validation (any of left/right)
  final List<PoseLandmarkType> requiredLandmarkTypes;

  /// Message shown when pose landmarks are not detected
  final String validationFailMessage;

  /// Initial "position the X" hint shown before detection starts
  final String initialPositionMessage;

  /// Overlay silhouette shape
  final SilhouetteShape shape;

  /// Per-angle instructions  key = 'Front' | 'Back' | 'Left' | 'Right' | '45° Left' | '45° Right'
  final Map<String, AngleInstruction> angleInstructions;

  const BodyPartConfig({
    required this.zones,
    required this.requiredLandmarkTypes,
    required this.validationFailMessage,
    required this.initialPositionMessage,
    required this.shape,
    required this.angleInstructions,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry — all keys are LOWER-CASE so caller does bodyPart.toLowerCase()
// ─────────────────────────────────────────────────────────────────────────────
const Map<String, BodyPartConfig> kBodyPartConfigs = {

  // ── FOREARM ──────────────────────────────────────────────────────────────
  'forearm': BodyPartConfig(
    zones: [
      LandmarkZone(yFraction: 0.13, label: 'ELBOW'),
      LandmarkZone(yFraction: 0.50, label: 'MID FOREARM'),
      LandmarkZone(yFraction: 0.87, label: 'WRIST'),
    ],
    requiredLandmarkTypes: [
      PoseLandmarkType.leftElbow,
      PoseLandmarkType.rightElbow,
      PoseLandmarkType.leftWrist,
      PoseLandmarkType.rightWrist,
    ],
    validationFailMessage: 'Ensure both elbow and wrist are visible',
    initialPositionMessage: 'Position the forearm inside the guide frame',
    shape: SilhouetteShape.verticalLimb,
    angleInstructions: {
      'Front': AngleInstruction(
        title: 'ANTERIOR VIEW',
        body: 'Hold palm facing UP (supinated). Wrist at bottom, elbow at top.',
      ),
      'Back': AngleInstruction(
        title: 'POSTERIOR VIEW',
        body: 'Flip arm — palm facing DOWN (pronated). Keep elbow in frame.',
      ),
      'Left': AngleInstruction(
        title: 'LATERAL VIEW',
        body: 'Rotate arm so thumb side faces the camera. Keep forearm vertical.',
      ),
      'Right': AngleInstruction(
        title: 'MEDIAL VIEW',
        body: 'Rotate arm so pinky side faces camera. Forearm upright, centred.',
      ),
      '45° Left': AngleInstruction(
        title: '45° OBLIQUE — LEFT',
        body: 'Rotate halfway between front and left. Thumb facing upper-left.',
      ),
      '45° Right': AngleInstruction(
        title: '45° OBLIQUE — RIGHT',
        body: 'Rotate halfway between front and right. Pinky facing upper-right.',
      ),
    },
  ),

  // ── WRIST ─────────────────────────────────────────────────────────────────
  'wrist': BodyPartConfig(
    zones: [
      LandmarkZone(yFraction: 0.18, label: 'DISTAL FOREARM'),
      LandmarkZone(yFraction: 0.50, label: 'WRIST CREASE'),
      LandmarkZone(yFraction: 0.82, label: 'MCP JOINT'),
    ],
    requiredLandmarkTypes: [
      PoseLandmarkType.leftWrist,
      PoseLandmarkType.rightWrist,
      PoseLandmarkType.leftPinky,
      PoseLandmarkType.rightPinky,
    ],
    validationFailMessage: 'Ensure hand and forearm are both visible',
    initialPositionMessage: 'Position the wrist inside the guide frame',
    shape: SilhouetteShape.narrowLimb,
    angleInstructions: {
      'Front': AngleInstruction(
        title: 'ANTERIOR VIEW',
        body: 'Palm facing UP. Center the wrist joint in the frame.',
      ),
      'Back': AngleInstruction(
        title: 'POSTERIOR VIEW',
        body: 'Back of the hand facing camera. Keep wrist straight.',
      ),
      'Left': AngleInstruction(
        title: 'LATERAL VIEW',
        body: 'Thumb side facing camera. Keep forearm steady.',
      ),
      'Right': AngleInstruction(
        title: 'MEDIAL VIEW',
        body: 'Pinky side facing camera. Keep wrist steady.',
      ),
      '45° Left': AngleInstruction(
        title: '45° OBLIQUE — LEFT',
        body: 'Rotate wrist halfway to the left.',
      ),
      '45° Right': AngleInstruction(
        title: '45° OBLIQUE — RIGHT',
        body: 'Rotate wrist halfway to the right.',
      ),
    },
  ),

  // ── ELBOW ─────────────────────────────────────────────────────────────────
  'elbow': BodyPartConfig(
    zones: [
      LandmarkZone(yFraction: 0.15, label: 'UPPER ARM'),
      LandmarkZone(yFraction: 0.50, label: 'OLECRANON'),
      LandmarkZone(yFraction: 0.85, label: 'PROX. FOREARM'),
    ],
    requiredLandmarkTypes: [
      PoseLandmarkType.leftElbow,
      PoseLandmarkType.rightElbow,
      PoseLandmarkType.leftShoulder,
      PoseLandmarkType.rightShoulder,
    ],
    validationFailMessage: 'Ensure upper arm and forearm are both visible',
    initialPositionMessage: 'Position the elbow inside the guide frame',
    shape: SilhouetteShape.verticalLimb,
    angleInstructions: {
      'Front': AngleInstruction(
        title: 'ANTERIOR VIEW',
        body: 'Palm facing UP. Arm extended to show elbow crease.',
      ),
      'Back': AngleInstruction(
        title: 'POSTERIOR VIEW',
        body: 'Back of arm facing camera. Show the point of the elbow.',
      ),
      'Left': AngleInstruction(
        title: 'LATERAL VIEW',
        body: 'Rotate arm to show outer elbow. Keep steady.',
      ),
      'Right': AngleInstruction(
        title: 'MEDIAL VIEW',
        body: 'Rotate arm to show inner elbow. Keep steady.',
      ),
      '45° Left': AngleInstruction(
        title: '45° OBLIQUE — LEFT',
        body: 'Rotate elbow 45 degrees to the left.',
      ),
      '45° Right': AngleInstruction(
        title: '45° OBLIQUE — RIGHT',
        body: 'Rotate elbow 45 degrees to the right.',
      ),
    },
  ),

  // ── HAND ─────────────────────────────────────────────────────────────────
  'hand': BodyPartConfig(
    zones: [
      LandmarkZone(yFraction: 0.15, label: 'WRIST'),
      LandmarkZone(yFraction: 0.50, label: 'MID PALM'),
      LandmarkZone(yFraction: 0.85, label: 'FINGER TIPS'),
    ],
    requiredLandmarkTypes: [
      PoseLandmarkType.leftWrist,
      PoseLandmarkType.rightWrist,
      PoseLandmarkType.leftIndex,
      PoseLandmarkType.rightIndex,
    ],
    validationFailMessage: 'Ensure full hand from wrist to fingertips is visible',
    initialPositionMessage: 'Position the hand inside the guide frame',
    shape: SilhouetteShape.handShaped,
    angleInstructions: {
      'Front': AngleInstruction(
        title: 'PALMAR VIEW',
        body: 'Palm facing camera, fingers pointing UP. Keep hand flat.',
      ),
      'Back': AngleInstruction(
        title: 'DORSAL VIEW',
        body: 'Back of hand facing camera, fingers pointing UP.',
      ),
      'Left': AngleInstruction(
        title: 'RADIAL VIEW',
        body: 'Thumb side facing camera. Keep fingers straight.',
      ),
      'Right': AngleInstruction(
        title: 'ULNAR VIEW',
        body: 'Pinky side facing camera. Keep fingers straight.',
      ),
      '45° Left': AngleInstruction(
        title: '45° OBLIQUE — LEFT',
        body: 'Rotate hand 45° toward thumb side.',
      ),
      '45° Right': AngleInstruction(
        title: '45° OBLIQUE — RIGHT',
        body: 'Rotate hand 45° toward pinky side.',
      ),
    },
  ),

  // ── ANKLE ─────────────────────────────────────────────────────────────────
  'ankle': BodyPartConfig(
    zones: [
      LandmarkZone(yFraction: 0.15, label: 'KNEE'),
      LandmarkZone(yFraction: 0.50, label: 'MID LEG'),
      LandmarkZone(yFraction: 0.85, label: 'ANKLE'),
    ],
    requiredLandmarkTypes: [
      PoseLandmarkType.leftAnkle,
      PoseLandmarkType.rightAnkle,
      PoseLandmarkType.leftKnee,
      PoseLandmarkType.rightKnee,
    ],
    validationFailMessage: 'Ensure both knee and ankle are visible',
    initialPositionMessage: 'Position the leg inside the guide frame',
    shape: SilhouetteShape.verticalLimb,
    angleInstructions: {
      'Front': AngleInstruction(
        title: 'ANTERIOR VIEW',
        body: 'Toes pointing straight UP. Keep ankle centered in frame.',
      ),
      'Back': AngleInstruction(
        title: 'POSTERIOR VIEW',
        body: 'Show the heel facing the camera. Toes pointing away.',
      ),
      'Left': AngleInstruction(
        title: 'LATERAL VIEW',
        body: 'Rotate leg so the outer ankle bone faces the camera.',
      ),
      'Right': AngleInstruction(
        title: 'MEDIAL VIEW',
        body: 'Rotate leg so the inner ankle bone faces the camera.',
      ),
      '45° Left': AngleInstruction(
        title: '45° OBLIQUE — LEFT',
        body: 'Rotate ankle 45 degrees to the left.',
      ),
      '45° Right': AngleInstruction(
        title: '45° OBLIQUE — RIGHT',
        body: 'Rotate ankle 45 degrees to the right.',
      ),
    },
  ),

  // ── FOOT ──────────────────────────────────────────────────────────────────
  'foot': BodyPartConfig(
    zones: [
      LandmarkZone(yFraction: 0.18, label: 'ANKLE'),
      LandmarkZone(yFraction: 0.52, label: 'MID FOOT'),
      LandmarkZone(yFraction: 0.86, label: 'TOES'),
    ],
    requiredLandmarkTypes: [
      PoseLandmarkType.leftAnkle,
      PoseLandmarkType.rightAnkle,
      PoseLandmarkType.leftHeel,
      PoseLandmarkType.rightHeel,
    ],
    validationFailMessage: 'Ensure full foot from ankle to toes is visible',
    initialPositionMessage: 'Position the foot inside the guide frame',
    shape: SilhouetteShape.footShaped,
    angleInstructions: {
      'Front': AngleInstruction(
        title: 'DORSAL VIEW',
        body: 'Top of foot facing camera, toes pointing UP. Keep foot flat.',
      ),
      'Back': AngleInstruction(
        title: 'PLANTAR VIEW',
        body: 'Sole of foot facing camera. Toes pointing UP.',
      ),
      'Left': AngleInstruction(
        title: 'LATERAL VIEW',
        body: 'Outer edge of foot facing camera. Keep foot aligned vertically.',
      ),
      'Right': AngleInstruction(
        title: 'MEDIAL VIEW',
        body: 'Inner arch side facing camera. Keep foot aligned vertically.',
      ),
      '45° Left': AngleInstruction(
        title: '45° OBLIQUE — LEFT',
        body: 'Rotate foot 45° to the outer side.',
      ),
      '45° Right': AngleInstruction(
        title: '45° OBLIQUE — RIGHT',
        body: 'Rotate foot 45° to the inner side.',
      ),
    },
  ),

  // ── KNEE ──────────────────────────────────────────────────────────────────
  'knee': BodyPartConfig(
    zones: [
      LandmarkZone(yFraction: 0.15, label: 'MID THIGH'),
      LandmarkZone(yFraction: 0.50, label: 'PATELLA'),
      LandmarkZone(yFraction: 0.85, label: 'TIBIAL CREST'),
    ],
    requiredLandmarkTypes: [
      PoseLandmarkType.leftKnee,
      PoseLandmarkType.rightKnee,
      PoseLandmarkType.leftHip,
      PoseLandmarkType.rightHip,
    ],
    validationFailMessage: 'Ensure thigh and lower leg are both visible',
    initialPositionMessage: 'Position the knee inside the guide frame',
    shape: SilhouetteShape.kneeShaped,
    angleInstructions: {
      'Front': AngleInstruction(
        title: 'ANTERIOR VIEW',
        body: 'Leg extended or slightly bent, kneecap facing camera.',
      ),
      'Back': AngleInstruction(
        title: 'POSTERIOR VIEW',
        body: 'Back of knee (popliteal) facing camera. Keep leg straight.',
      ),
      'Left': AngleInstruction(
        title: 'LATERAL VIEW',
        body: 'Outer knee facing camera. Keep leg extended.',
      ),
      'Right': AngleInstruction(
        title: 'MEDIAL VIEW',
        body: 'Inner knee facing camera. Keep leg extended.',
      ),
      '45° Left': AngleInstruction(
        title: '45° OBLIQUE — LEFT',
        body: 'Rotate leg 45° to show outer joint line.',
      ),
      '45° Right': AngleInstruction(
        title: '45° OBLIQUE — RIGHT',
        body: 'Rotate leg 45° to show inner joint line.',
      ),
    },
  ),

  // ── SHOULDER ──────────────────────────────────────────────────────────────
  'shoulder': BodyPartConfig(
    zones: [
      LandmarkZone(yFraction: 0.18, label: 'ACROMION'),
      LandmarkZone(yFraction: 0.50, label: 'GH JOINT'),
      LandmarkZone(yFraction: 0.82, label: 'UPPER ARM'),
    ],
    requiredLandmarkTypes: [
      PoseLandmarkType.leftShoulder,
      PoseLandmarkType.rightShoulder,
      PoseLandmarkType.leftElbow,
      PoseLandmarkType.rightElbow,
    ],
    validationFailMessage: 'Ensure shoulder and upper arm are both visible',
    initialPositionMessage: 'Position the shoulder inside the guide frame',
    shape: SilhouetteShape.verticalLimb,
    angleInstructions: {
      'Front': AngleInstruction(
        title: 'ANTERIOR VIEW',
        body: 'Face the camera. Arm at side, palm facing forward.',
      ),
      'Back': AngleInstruction(
        title: 'POSTERIOR VIEW',
        body: 'Back of shoulder facing camera. Keep arm relaxed at side.',
      ),
      'Left': AngleInstruction(
        title: 'LATERAL VIEW',
        body: 'Outer shoulder facing camera. Arm at side.',
      ),
      'Right': AngleInstruction(
        title: 'MEDIAL VIEW',
        body: 'Inner shoulder area facing camera. Arm at side.',
      ),
      '45° Left': AngleInstruction(
        title: '45° OBLIQUE — LEFT',
        body: 'Rotate 45° to show anterior-lateral shoulder.',
      ),
      '45° Right': AngleInstruction(
        title: '45° OBLIQUE — RIGHT',
        body: 'Rotate 45° to show posterior-lateral shoulder.',
      ),
    },
  ),
};

/// Returns the config for a given body part string (case-insensitive).
/// Falls back to the forearm config if the body part is unrecognised.
BodyPartConfig getBodyPartConfig(String bodyPart) {
  return kBodyPartConfigs[bodyPart.toLowerCase()] ??
      kBodyPartConfigs['forearm']!;
}

/// Landmark editor definitions (proximal/mid/distal labels + colours)
/// for use in LandmarkEditor._initializeLandmarks()
Map<String, Map<String, dynamic>> getLandmarkEditorDefs(String bodyPart) {
  switch (bodyPart.toLowerCase()) {
    case 'forearm':
      return {
        'proximal': {'label': 'Elbow Crease',    'x': 50.0, 'y': 18.0, 'color': 0xFFEF4444},
        'mid':      {'label': 'Mid Forearm',      'x': 50.0, 'y': 50.0, 'color': 0xFFF59E0B},
        'distal':   {'label': 'Wrist Joint',      'x': 50.0, 'y': 82.0, 'color': 0xFF10B981},
      };
    case 'wrist':
      return {
        'proximal': {'label': 'Distal Forearm',   'x': 50.0, 'y': 25.0, 'color': 0xFFEF4444},
        'mid':      {'label': 'Wrist Crease',     'x': 50.0, 'y': 50.0, 'color': 0xFFF59E0B},
        'distal':   {'label': 'MCP Joint',        'x': 50.0, 'y': 75.0, 'color': 0xFF10B981},
      };
    case 'elbow':
      return {
        'proximal': {'label': 'Upper Arm',        'x': 50.0, 'y': 25.0, 'color': 0xFFEF4444},
        'mid':      {'label': 'Olecranon',        'x': 50.0, 'y': 52.0, 'color': 0xFFF59E0B},
        'distal':   {'label': 'Prox. Forearm',    'x': 50.0, 'y': 75.0, 'color': 0xFF10B981},
      };
    case 'hand':
      return {
        'proximal': {'label': 'Wrist',            'x': 50.0, 'y': 20.0, 'color': 0xFFEF4444},
        'mid':      {'label': 'Mid Palm',         'x': 50.0, 'y': 50.0, 'color': 0xFFF59E0B},
        'distal':   {'label': 'Finger Tips',      'x': 50.0, 'y': 82.0, 'color': 0xFF10B981},
      };
    case 'ankle':
      return {
        'proximal': {'label': 'Calf Base',        'x': 50.0, 'y': 22.0, 'color': 0xFFEF4444},
        'mid':      {'label': 'Lateral Malleolus','x': 50.0, 'y': 55.0, 'color': 0xFFF59E0B},
        'distal':   {'label': 'Heel Base',        'x': 50.0, 'y': 80.0, 'color': 0xFF10B981},
      };
    case 'foot':
      return {
        'proximal': {'label': 'Ankle Joint',      'x': 50.0, 'y': 20.0, 'color': 0xFFEF4444},
        'mid':      {'label': 'Mid Foot',         'x': 50.0, 'y': 52.0, 'color': 0xFFF59E0B},
        'distal':   {'label': 'Toe Base (MTP)',   'x': 50.0, 'y': 82.0, 'color': 0xFF10B981},
      };
    case 'knee':
      return {
        'proximal': {'label': 'Mid Thigh',        'x': 50.0, 'y': 22.0, 'color': 0xFFEF4444},
        'mid':      {'label': 'Patella',          'x': 50.0, 'y': 50.0, 'color': 0xFFF59E0B},
        'distal':   {'label': 'Tibial Crest',     'x': 50.0, 'y': 78.0, 'color': 0xFF10B981},
      };
    case 'shoulder':
      return {
        'proximal': {'label': 'Acromion',         'x': 50.0, 'y': 20.0, 'color': 0xFFEF4444},
        'mid':      {'label': 'GH Joint',         'x': 50.0, 'y': 50.0, 'color': 0xFFF59E0B},
        'distal':   {'label': 'Upper Arm',        'x': 50.0, 'y': 78.0, 'color': 0xFF10B981},
      };
    default:
      // Safe forearm fallback — should never hit this
      return {
        'proximal': {'label': 'Elbow Crease',    'x': 50.0, 'y': 18.0, 'color': 0xFFEF4444},
        'mid':      {'label': 'Mid Forearm',      'x': 50.0, 'y': 50.0, 'color': 0xFFF59E0B},
        'distal':   {'label': 'Wrist Joint',      'x': 50.0, 'y': 82.0, 'color': 0xFF10B981},
      };
  }
}
