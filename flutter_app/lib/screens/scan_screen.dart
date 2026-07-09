import 'dart:async';
import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';
import 'package:permission_handler/permission_handler.dart';
import '../painters/forearm_guide_painter.dart';
import '../services/supabase_service.dart';
import 'landmark_editor.dart';
import '../main.dart';

// ─── Per-angle scan instructions ────────────────────────────────────────────
const Map<String, Map<String, String>> _angleInstructions = {
  'Front': {
    'title': 'ANTERIOR VIEW',
    'body': 'Hold palm facing UP (supinated). Wrist at bottom, elbow at top.',
  },
  'Back': {
    'title': 'POSTERIOR VIEW',
    'body': 'Flip arm — palm facing DOWN (pronated). Keep elbow in frame.',
  },
  'Left': {
    'title': 'LATERAL VIEW',
    'body': 'Rotate arm so thumb side faces the camera. Keep forearm vertical.',
  },
  'Right': {
    'title': 'MEDIAL VIEW',
    'body': 'Rotate arm so pinky side faces camera. Forearm upright, centred.',
  },
  '45° Left': {
    'title': '45° OBLIQUE — LEFT',
    'body': 'Rotate halfway between front and left. Thumb facing upper-left.',
  },
  '45° Right': {
    'title': '45° OBLIQUE — RIGHT',
    'body': 'Rotate halfway between front and right. Pinky facing upper-right.',
  },
};

class ScanScreen extends StatefulWidget {
  final String authToken;
  final Map<String, dynamic> orthoCase;

  const ScanScreen({
    super.key,
    required this.authToken,
    required this.orthoCase,
  });

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen>
    with TickerProviderStateMixin {
  // ── Camera ────────────────────────────────────────────────────────────────
  CameraController? _cameraController;
  bool _isCameraInitialized = false;
  bool _isProcessingFrame = false;
  DateTime _lastAnalysisTime = DateTime.now();

  final PoseDetector _poseDetector = PoseDetector(options: PoseDetectorOptions());

  // ── Workflow state ────────────────────────────────────────────────────────
  int _currentStep = 0;
  final List<String> _angles = [
    'Front', 'Back', 'Left', 'Right', '45° Left', '45° Right'
  ];
  final List<Map<String, dynamic>> _capturedViews = [];
  bool _isCapturing = false;
  bool _isNavigating = false; // guard against double navigation

  // ── Auto-validation ───────────────────────────────────────────────────────
  /// 0.0 = not aligned, 1.0 = fully validated, ready to capture
  double _validationScore = 0.0;

  /// How many consecutive frames passed all checks
  int _stableFrameCount = 0;

  /// Frames needed before auto-capture fires
  static const int _kStableFramesRequired = 10; // Increased to prevent premature capture

  Timer? _analysisTimer;
  Timer? _autoCaptureTimer;

  // ── Animations ────────────────────────────────────────────────────────────
  late AnimationController _pulseController;
  late AnimationController _countdownController;
  late Animation<double> _countdownAnimation;

  // ── Status text ──────────────────────────────────────────────────────────
  String _statusMessage = 'Position the forearm inside the guide frame';
  Color _statusColor = const Color(0xFFEF4444);

  @override
  void initState() {
    super.initState();

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat();

    _countdownController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _countdownAnimation = CurvedAnimation(
      parent: _countdownController,
      curve: Curves.easeInOut,
    );

    _initializeCamera();
  }

  @override
  void dispose() {
    _analysisTimer?.cancel();
    _autoCaptureTimer?.cancel();
    _poseDetector.close();
    if (_cameraController != null && _cameraController!.value.isStreamingImages) {
      _cameraController!.stopImageStream();
    }
    _cameraController?.dispose();
    _pulseController.dispose();
    _countdownController.dispose();
    super.dispose();
  }

  // ── Camera init ───────────────────────────────────────────────────────────
  Future<void> _initializeCamera() async {
    final status = await Permission.camera.request();
    if (status != PermissionStatus.granted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Camera permission is required to capture scans.'),
            backgroundColor: Color(0xFFEF4444),
          ),
        );
        Navigator.pop(context);
      }
      return;
    }

    // Fetch cameras if not already loaded
    if (cameras.isEmpty) {
      try {
        cameras = await availableCameras();
      } catch (e) {
        debugPrint('availableCameras error: $e');
      }
    }

    if (cameras.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No cameras detected on this device.'),
            backgroundColor: Color(0xFFEF4444),
          ),
        );
        Navigator.pop(context);
      }
      return;
    }

    final backCam = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.back,
      orElse: () => cameras.first,
    );

    _cameraController = CameraController(
      backCam,
      ResolutionPreset.high,
      enableAudio: false,
      imageFormatGroup: Platform.isAndroid
          ? ImageFormatGroup.nv21
          : ImageFormatGroup.bgra8888,
    );

    try {
      await _cameraController!.initialize();
      if (mounted) {
        setState(() => _isCameraInitialized = true);
        _startFrameAnalysisStream();
      }
    } catch (e) {
      debugPrint('Camera init error: $e');
    }
  }

  // ── Real-time camera frame stream analysis (Skin & Alignment Detection) ────
  void _startFrameAnalysisStream() {
    if (_cameraController == null || !_cameraController!.value.isInitialized) return;

    _stableFrameCount = 0;
    _validationScore = 0.0;
    _isProcessingFrame = false;

    _cameraController!.startImageStream((CameraImage image) {
      if (!mounted || _isCapturing || _isNavigating || _isProcessingFrame) return;

      _isProcessingFrame = true;
      _analyzeFrame(image);
    });
  }

  Future<void> _analyzeFrame(CameraImage image) async {
    try {
      final now = DateTime.now();
      if (now.difference(_lastAnalysisTime).inMilliseconds < 350) {
        _isProcessingFrame = false;
        return;
      }
      _lastAnalysisTime = now;

      if (_cameraController == null) return;

      final camera = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      final sensorOrientation = camera.sensorOrientation;
      InputImageRotation? rotation;
      if (Platform.isIOS) {
        rotation = InputImageRotationValue.fromRawValue(sensorOrientation);
      } else if (Platform.isAndroid) {
        var rotationCompensation = 0;
        switch (_cameraController!.value.deviceOrientation) {
          case DeviceOrientation.portraitUp: rotationCompensation = 0; break;
          case DeviceOrientation.landscapeLeft: rotationCompensation = 90; break;
          case DeviceOrientation.portraitDown: rotationCompensation = 180; break;
          case DeviceOrientation.landscapeRight: rotationCompensation = 270; break;
        }
        if (camera.lensDirection == CameraLensDirection.front) {
          rotationCompensation = (sensorOrientation + rotationCompensation) % 360;
        } else {
          rotationCompensation = (sensorOrientation - rotationCompensation + 360) % 360;
        }
        rotation = InputImageRotationValue.fromRawValue(rotationCompensation);
      }

      if (rotation == null) {
        _isProcessingFrame = false;
        return;
      }

      final format = InputImageFormatValue.fromRawValue(image.format.raw);
      if (format == null ||
          (Platform.isAndroid && format != InputImageFormat.nv21) ||
          (Platform.isIOS && format != InputImageFormat.bgra8888)) {
        _isProcessingFrame = false;
        return;
      }

      if (image.planes.isEmpty) {
        _isProcessingFrame = false;
        return;
      }

      final WriteBuffer allBytes = WriteBuffer();
      for (final Plane plane in image.planes) {
        allBytes.putUint8List(plane.bytes);
      }
      final bytes = allBytes.done().buffer.asUint8List();

      final inputImage = InputImage.fromBytes(
        bytes: bytes,
        metadata: InputImageMetadata(
          size: Size(image.width.toDouble(), image.height.toDouble()),
          rotation: rotation,
          format: format,
          bytesPerRow: image.planes[0].bytesPerRow,
        ),
      );

      final List<Pose> poses = await _poseDetector.processImage(inputImage);

      double nextScore = _validationScore;
      String msg = _statusMessage;
      Color col = _statusColor;

      if (poses.isEmpty) {
        nextScore = (nextScore - 0.15).clamp(0.0, 1.0);
        msg = 'Limb not detected. Align limb inside guide';
        col = const Color(0xFFEF4444);
      } else {
        final pose = poses.first;
        final leftWrist = pose.landmarks[PoseLandmarkType.leftWrist];
        final rightWrist = pose.landmarks[PoseLandmarkType.rightWrist];
        final leftElbow = pose.landmarks[PoseLandmarkType.leftElbow];
        final rightElbow = pose.landmarks[PoseLandmarkType.rightElbow];

        final hasValidWrist = (leftWrist != null && leftWrist.likelihood > 0.6) || 
                              (rightWrist != null && rightWrist.likelihood > 0.6);
        final hasValidElbow = (leftElbow != null && leftElbow.likelihood > 0.6) || 
                              (rightElbow != null && rightElbow.likelihood > 0.6);

        if (!hasValidWrist || !hasValidElbow) {
          nextScore = (nextScore - 0.10).clamp(0.0, 1.0);
          msg = 'Ensure both wrist and elbow are visible';
          col = const Color(0xFFF59E0B);
        } else {
          nextScore = (nextScore + 0.15).clamp(0.0, 1.0);
          if (nextScore < 0.4) {
            msg = 'Limb detected. Keep steady…';
            col = const Color(0xFFF59E0B);
          } else if (nextScore < 0.85) {
            msg = 'Limb aligned — hold camera still…';
            col = const Color(0xFF34D399);
          } else {
            msg = '✓ Aligned — auto-capturing…';
            col = const Color(0xFF10B981);
          }
        }
      }

      _stableFrameCount = nextScore >= 1.0 ? _stableFrameCount + 1 : 0;

      if (mounted) {
        setState(() {
          _validationScore = nextScore;
          _statusMessage = msg;
          _statusColor = col;
        });
      }

      if (_stableFrameCount >= _kStableFramesRequired && !_isCapturing && !_isNavigating) {
        if (_cameraController != null && _cameraController!.value.isStreamingImages) {
          _cameraController!.stopImageStream();
        }
        _triggerAutoCapture();
      }
    } catch (e, stack) {
      debugPrint('Error analyzing frame: $e\\n$stack');
    } finally {
      _isProcessingFrame = false;
    }
  }

  void _resetAnalysis() {
    _autoCaptureTimer?.cancel();
    _countdownController.reset();
    setState(() {
      _validationScore = 0.0;
      _stableFrameCount = 0;
      _statusMessage = 'Position the forearm inside the guide frame';
      _statusColor = const Color(0xFFEF4444);
      _isCapturing = false;
      _isNavigating = false;
    });
    _startFrameAnalysisStream();
  }

  void _triggerAutoCapture() {
    if (_isCapturing || _isNavigating) {
      return;
    }
    _countdownController.forward(from: 0.0);
    _autoCaptureTimer = Timer(const Duration(milliseconds: 600), _takePicture);
  }

  // ── Capture ───────────────────────────────────────────────────────────────
  Future<void> _takePicture() async {
    if (_cameraController == null ||
        !_cameraController!.value.isInitialized ||
        _isCapturing ||
        _isNavigating) {
      return;
    }

    setState(() => _isCapturing = true);

    try {
      if (_cameraController!.value.isStreamingImages) {
        await _cameraController!.stopImageStream();
      }
      final XFile raw = await _cameraController!.takePicture();
      final File imageFile = File(raw.path);

      if (!mounted) {
        return;
      }
      setState(() => _isNavigating = true);

      final result = await Navigator.push<Map<String, dynamic>>(
        context,
        MaterialPageRoute(
          builder: (_) => LandmarkEditor(
            authToken: widget.authToken,
            orthoCase: widget.orthoCase,
            angle: _angles[_currentStep],
            imageFile: imageFile,
          ),
        ),
      );

      if (!mounted) {
        return;
      }

      if (result != null) {
        final newViews = [..._capturedViews, result];
        final nextStep = _currentStep + 1;

        setState(() {
          _capturedViews.clear();
          _capturedViews.addAll(newViews);
          _isNavigating = false;
        });

        if (nextStep < _angles.length) {
          setState(() => _currentStep = nextStep);
          _resetAnalysis();
        } else {
          _finishCaptureSession();
        }
      } else {
        // User retook — reset
        _resetAnalysis();
      }
    } catch (e) {
      debugPrint('takePicture error: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to capture image: $e')),
      );
      _resetAnalysis();
    }
  }

  // ── Submit session ────────────────────────────────────────────────────────
  Future<void> _finishCaptureSession() async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 18),
                Text('Uploading Scan…',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                SizedBox(height: 6),
                Text('Syncing to medical storage…',
                    style: TextStyle(fontSize: 11, color: Colors.grey)),
              ],
            ),
          ),
        ),
      ),
    );

    final result = await SupabaseService.submitScanViews(
      widget.orthoCase['id'],
      _capturedViews,
    );

    if (!mounted) {
      return;
    }
    Navigator.pop(context); // close dialog

    if (result) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✓ Scan submitted successfully — awaiting doctor review.'),
          backgroundColor: Color(0xFF10B981),
          duration: Duration(seconds: 4),
        ),
      );
      Navigator.pop(context);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              '⚠️ Upload failed. Ensure the "scans" Storage bucket exists in Supabase and is set to Public.'),
          backgroundColor: Color(0xFFEF4444),
          duration: Duration(seconds: 6),
        ),
      );
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final bodyPart = widget.orthoCase['bodyPart'] ?? 'Forearm';
    final side = widget.orthoCase['side'] ?? '';
    final patientName = widget.orthoCase['patientName'] ?? 'Patient';
    final angle = _angles[_currentStep];
    final instruction = _angleInstructions[angle] ??
        {'title': angle.toUpperCase(), 'body': 'Align the limb in the frame.'};

    return Scaffold(
      backgroundColor: Colors.black,
      body: !_isCameraInitialized
          ? const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(color: Color(0xFF6366F1)),
                  SizedBox(height: 16),
                  Text('Starting camera…',
                      style: TextStyle(color: Colors.white70)),
                ],
              ),
            )
          : Stack(
              fit: StackFit.expand,
              children: [
                // ── Layer 1: Camera feed ────────────────────────────────────
                CameraPreview(_cameraController!),

                // ── Layer 2: Semi-transparent vignette ─────────────────────
                IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        center: Alignment.center,
                        radius: 0.9,
                        colors: [
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.45),
                        ],
                      ),
                    ),
                  ),
                ),

                // ── Layer 3: Anatomical guide overlay ─────────────────────
                Align(
                  alignment: const Alignment(0, 0.04),
                  child: SizedBox(
                    width: 230,
                    height: 380,
                    child: AnimatedBuilder(
                      animation: _pulseController,
                      builder: (context, _) => CustomPaint(
                        painter: ForearmGuidePainter(
                          validationScore: _validationScore,
                          currentAngle: angle,
                          pulsePhase: _pulseController.value,
                          isCapturing: _isCapturing,
                        ),
                      ),
                    ),
                  ),
                ),

                // ── Layer 4: Top instruction banner ───────────────────────
                Positioned(
                  top: MediaQuery.of(context).padding.top + 12,
                  left: 12,
                  right: 12,
                  child: Column(
                    children: [
                      // Patient + progress row
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              patientName,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 15,
                                shadows: [
                                  Shadow(color: Colors.black, blurRadius: 4)
                                ],
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          _buildStepDots(),
                        ],
                      ),
                      const SizedBox(height: 8),
                      // Angle instruction card
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.72),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                              color: Colors.white.withValues(alpha: 0.12)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              instruction['title']!,
                              style: TextStyle(
                                color: _statusColor,
                                fontWeight: FontWeight.bold,
                                fontSize: 11,
                                letterSpacing: 1.4,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '$bodyPart${side.isEmpty ? '' : ' · $side'} — ${instruction['body']}',
                              style: const TextStyle(
                                  color: Colors.white70, fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // ── Layer 5: Bottom status + shutter ─────────────────────
                Positioned(
                  bottom: 24 + MediaQuery.of(context).padding.bottom,
                  left: 16,
                  right: 16,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Validation status bar
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 10),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.80),
                          borderRadius: BorderRadius.circular(40),
                          border: Border.all(
                              color: _statusColor.withValues(alpha: 0.5),
                              width: 1.5),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Animated LED dot
                            AnimatedBuilder(
                              animation: _pulseController,
                              builder: (_, __) => Container(
                                width: 10,
                                height: 10,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: _statusColor.withValues(
                                      alpha: 0.5 + 0.5 * _pulseController.value),
                                  boxShadow: [
                                    BoxShadow(
                                      color: _statusColor.withValues(alpha: 0.6),
                                      blurRadius: 6,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Flexible(
                              child: Text(
                                _statusMessage,
                                style: TextStyle(
                                  color: _statusColor,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 18),

                      // Shutter + count row
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          // Captured count badge
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.black54,
                              border: Border.all(
                                  color: Colors.white24, width: 1.5),
                            ),
                            child: Center(
                              child: Text(
                                '${_capturedViews.length}/${_angles.length}',
                                style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold),
                              ),
                            ),
                          ),
                          const SizedBox(width: 24),

                          // Shutter button — shows countdown ring overlay
                          GestureDetector(
                            onTap: _validationScore >= 1.0 && !_isCapturing
                                ? _takePicture
                                : null,
                            child: AnimatedBuilder(
                              animation: _countdownAnimation,
                              builder: (_, child) => Stack(
                                alignment: Alignment.center,
                                children: [
                                  // Progress ring
                                  SizedBox(
                                    width: 80,
                                    height: 80,
                                    child: CustomPaint(
                                      painter: ValidationRingPainter(
                                        progress: _validationScore >= 1.0
                                            ? _countdownAnimation.value
                                            : 0.0,
                                        color: const Color(0xFF10B981),
                                      ),
                                    ),
                                  ),
                                  // Main button
                                  Container(
                                    width: 68,
                                    height: 68,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: _isCapturing
                                          ? Colors.grey[800]
                                          : _validationScore >= 1.0
                                              ? Colors.white
                                              : const Color(0xFF1F2937),
                                      border: Border.all(
                                        color: _validationScore >= 1.0
                                            ? const Color(0xFF10B981)
                                            : Colors.grey[700]!,
                                        width: 3,
                                      ),
                                    ),
                                    child: _isCapturing
                                        ? const Center(
                                            child: SizedBox(
                                              width: 26,
                                              height: 26,
                                              child: CircularProgressIndicator(
                                                  color: Color(0xFF6366F1),
                                                  strokeWidth: 2.5),
                                            ),
                                          )
                                        : Icon(
                                            _validationScore >= 1.0
                                                ? Icons.camera_alt_rounded
                                                : Icons.camera_alt_outlined,
                                            color: _validationScore >= 1.0
                                                ? const Color(0xFF059669)
                                                : Colors.grey[600],
                                            size: 30,
                                          ),
                                  ),
                                ],
                              ),
                            ),
                          ),

                          const SizedBox(width: 24),

                          // Skip / manual override button
                          GestureDetector(
                            onTap: !_isCapturing ? _takePicture : null,
                            child: Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.black54,
                                border: Border.all(
                                    color: Colors.white24, width: 1.5),
                              ),
                              child: const Icon(
                                Icons.touch_app_rounded,
                                color: Colors.white54,
                                size: 20,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  // ── Step dot indicator ────────────────────────────────────────────────────
  Widget _buildStepDots() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(_angles.length, (i) {
        final done = i < _capturedViews.length;
        final current = i == _currentStep;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          margin: const EdgeInsets.only(left: 4),
          width: current ? 14 : 7,
          height: 7,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(4),
            color: done
                ? const Color(0xFF10B981)
                : current
                    ? Colors.white
                    : Colors.white38,
          ),
        );
      }),
    );
  }
}
