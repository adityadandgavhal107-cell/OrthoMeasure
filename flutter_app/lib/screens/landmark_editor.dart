import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../services/supabase_service.dart';
import '../config/body_part_config.dart';

class LandmarkEditor extends StatefulWidget {
  final String authToken;
  final Map<String, dynamic> orthoCase;
  final String angle;
  final File imageFile;

  const LandmarkEditor({
    super.key,
    required this.authToken,
    required this.orthoCase,
    required this.angle,
    required this.imageFile,
  });

  @override
  State<LandmarkEditor> createState() => _LandmarkEditorState();
}

class _LandmarkEditorState extends State<LandmarkEditor>
    with SingleTickerProviderStateMixin {
  late Map<String, Map<String, dynamic>> _landmarks;
  bool _isUploading = false;
  Uint8List? _imageBytes;
  final GlobalKey _imageKey = GlobalKey();

  // Selected landmark key for highlighting
  String? _activeLandmark;

  // Entrance animation
  late AnimationController _enterController;
  late Animation<double> _enterAnimation;

  @override
  void initState() {
    super.initState();
    _initializeLandmarks();
    _loadAndApplyAIPredictions();
    _loadImageBytes();

    _enterController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _enterAnimation = CurvedAnimation(
      parent: _enterController,
      curve: Curves.easeOutBack,
    );
    _enterController.forward();
  }

  @override
  void dispose() {
    _enterController.dispose();
    super.dispose();
  }

  Future<void> _loadImageBytes() async {
    try {
      final bytes = await widget.imageFile.readAsBytes();
      if (mounted) setState(() => _imageBytes = bytes);
    } catch (e) {
      debugPrint('loadImageBytes error: $e');
    }
  }

  void _initializeLandmarks() {
    // All body-part landmark definitions live in body_part_config.dart.
    // getLandmarkEditorDefs() is case-insensitive and covers every supported
    // body part (forearm, wrist, elbow, hand, ankle, foot, knee, shoulder).
    final bodyPart = widget.orthoCase['bodyPart']?.toString() ?? 'Forearm';
    _landmarks = getLandmarkEditorDefs(bodyPart);
  }

  Future<void> _loadAndApplyAIPredictions() async {
    try {
      final res = await http.get(Uri.parse(
          'https://ydegxkfpzqfwcrfhcjge.supabase.co/storage/v1/object/public/scans/rl_model_data.json'));
      if (res.statusCode != 200) return;

      final data = json.decode(res.body) as Map<String, dynamic>;
      final weights = data['weights'] as Map<String, dynamic>;

      final w1 = (weights['W1'] as List).map((l) => (l as List).map((v) => double.parse(v.toString())).toList()).toList();
      final b1 = ((weights['b1'] as List)[0] as List).map((v) => double.parse(v.toString())).toList();
      final w2 = (weights['W2'] as List).map((l) => (l as List).map((v) => double.parse(v.toString())).toList()).toList();
      final b2 = ((weights['b2'] as List)[0] as List).map((v) => double.parse(v.toString())).toList();
      final w3 = (weights['W3'] as List).map((l) => (l as List).map((v) => double.parse(v.toString())).toList()).toList();
      final b3 = ((weights['b3'] as List)[0] as List).map((v) => double.parse(v.toString())).toList();

      // Build state vector (23)
      final state = List<double>.filled(23, 0.0);
      
      final age = widget.orthoCase['patientAge'] ?? 35.0;
      state[0] = age / 100.0;

      final gender = widget.orthoCase['patientGender'] ?? 'M';
      if (gender == 'M') {
        state[1] = 1.0;
      } else if (gender == 'F') {
        state[2] = 1.0;
      } else {
        state[3] = 1.0;
      }

      final side = widget.orthoCase['side'] ?? 'Left';
      if (side == 'Left') {
        state[4] = 1.0;
      } else {
        state[5] = 1.0;
      }

      final part = widget.orthoCase['bodyPart'] ?? 'Forearm';
      if (part == 'Forearm') {
        state[6] = 1.0;
      } else if (part == 'Wrist') {
        state[7] = 1.0;
      } else if (part == 'Ankle') {
        state[8] = 1.0;
      } else {
        state[9] = 1.0;
      }

      final mobility = widget.orthoCase['mobilityStatus'] ?? 'Normal';
      if (mobility == 'Normal') {
        state[10] = 1.0;
      } else if (mobility == 'Limited') {
        state[11] = 1.0;
      } else {
        state[12] = 1.0;
      }

      final swelling = widget.orthoCase['swellingStatus'] ?? 'Normal';
      if (swelling == 'Normal') {
        state[13] = 1.0;
      } else if (swelling == 'Mild') {
        state[14] = 1.0;
      } else if (swelling == 'Moderate') {
        state[15] = 1.0;
      } else {
        state[16] = 1.0;
      }

      final angles = ['Front', 'Back', 'Left', 'Right', '45° Left', '45° Right'];
      final angleIdx = angles.indexOf(widget.angle);
      if (angleIdx != -1) {
        state[17 + angleIdx] = 1.0;
      }

      // FC1 ReLU
      final h1 = List<double>.filled(32, 0.0);
      for (int j = 0; j < 32; j++) {
        double sum = b1[j];
        for (int i = 0; i < 23; i++) {
          sum += state[i] * w1[i][j];
        }
        h1[j] = sum > 0.0 ? sum : 0.0;
      }

      // FC2 ReLU
      final h2 = List<double>.filled(16, 0.0);
      for (int j = 0; j < 16; j++) {
        double sum = b2[j];
        for (int i = 0; i < 32; i++) {
          sum += h1[i] * w2[i][j];
        }
        h2[j] = sum > 0.0 ? sum : 0.0;
      }

      // Output FC3
      final offsets = List<double>.filled(6, 0.0);
      for (int j = 0; j < 6; j++) {
        double sum = b3[j];
        for (int i = 0; i < 16; i++) {
          sum += h2[i] * w3[i][j];
        }
        offsets[j] = sum;
      }

      if (mounted) {
        setState(() {
          final keys = ['proximal', 'mid', 'distal'];
          for (int i = 0; i < 3; i++) {
            final k = keys[i];
            final double baseValX = _landmarks[k]!['x'];
            final double baseValY = _landmarks[k]!['y'];
            
            final double newX = (baseValX + offsets[i * 2]).clamp(5.0, 95.0);
            final double newY = (baseValY + offsets[i * 2 + 1]).clamp(5.0, 95.0);
            
            _landmarks[k]!['x'] = double.parse(newX.toStringAsFixed(1));
            _landmarks[k]!['y'] = double.parse(newY.toStringAsFixed(1));
          }
        });
        debugPrint('AI Reinforcement Learning landmark offsets applied successfully.');
      }
    } catch (e) {
      debugPrint('Failed to run AI landmark inference: $e');
    }
  }

  void _onPanUpdate(String key, DragUpdateDetails details) {
    final RenderBox? box =
        _imageKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;

    final local = box.globalToLocal(details.globalPosition);
    final xPct = (local.dx / box.size.width * 100).clamp(2.0, 98.0);
    final yPct = (local.dy / box.size.height * 100).clamp(2.0, 98.0);

    setState(() {
      _landmarks[key]!['x'] = double.parse(xPct.toStringAsFixed(1));
      _landmarks[key]!['y'] = double.parse(yPct.toStringAsFixed(1));
    });
  }

  Future<void> _confirmView() async {
    setState(() => _isUploading = true);

    final caseId = widget.orthoCase['id'] ?? 'unknown';
    final safeAngle = widget.angle.replaceAll(' ', '_').replaceAll('°', 'deg');
    final filename =
        '$caseId-$safeAngle-${DateTime.now().millisecondsSinceEpoch}.jpg';

    String? hostedUrl;
    if (_imageBytes != null) {
      final uploadResult =
          await SupabaseService.uploadImageBytesWithRetry(_imageBytes!, filename);
      hostedUrl = uploadResult.url;

      if (!uploadResult.success && mounted) {
        setState(() => _isUploading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(uploadResult.errorMessage ??
                'Upload failed — check Supabase Storage "scans" bucket.'),
            backgroundColor: const Color(0xFFEF4444),
            duration: const Duration(seconds: 6),
          ),
        );
        return;
      }
    } else {
      hostedUrl = await SupabaseService.uploadImageFile(widget.imageFile);
    }

    setState(() => _isUploading = false);

    if (hostedUrl != null && mounted) {
      Navigator.pop(context, {
        'angle': widget.angle,
        'url': hostedUrl,
        'landmarks': _landmarks,
        'qualityScore':
            90 + ((!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) ? 5 : 2),
      });
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              '⚠️ Upload failed. Ensure the "scans" bucket exists in Supabase Storage and is set to Public.'),
          backgroundColor: Color(0xFFEF4444),
          duration: Duration(seconds: 6),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0F),
      appBar: AppBar(
        backgroundColor: const Color(0xFF111827),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Adjust Landmarks',
              style: TextStyle(color: Colors.white, fontSize: 15),
            ),
            Text(
              widget.angle,
              style: const TextStyle(color: Color(0xFF6366F1), fontSize: 11),
            ),
          ],
        ),
        automaticallyImplyLeading: !_isUploading,
        actions: [
          if (!_isUploading)
            TextButton.icon(
              onPressed: _confirmView,
              icon: const Icon(Icons.check_circle_outline,
                  color: Color(0xFF10B981), size: 20),
              label: const Text('CONFIRM',
                  style: TextStyle(
                      color: Color(0xFF10B981),
                      fontWeight: FontWeight.bold,
                      fontSize: 13)),
            ),
        ],
      ),
      body: _isUploading
          ? _buildUploadingState()
          : Column(
              children: [
                // ── Instruction strip ────────────────────────────────────
                Container(
                  width: double.infinity,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  color: const Color(0xFF1A1A2E),
                  child: Row(
                    children: [
                      const Icon(Icons.touch_app_rounded,
                          color: Color(0xFF6366F1), size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Drag the coloured handles to align anatomical landmarks on the image.',
                          style: TextStyle(
                              color: Colors.grey[400], fontSize: 11),
                        ),
                      ),
                    ],
                  ),
                ),

                // ── Draggable image canvas ───────────────────────────────
                Expanded(
                  child: InteractiveViewer(
                    minScale: 1.0,
                    maxScale: 4.0,
                    child: Center(
                      child: AspectRatio(
                        aspectRatio: 3 / 4,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Stack(
                            key: _imageKey,
                            children: [
                              // Photo background
                              Positioned.fill(
                                child: _imageBytes != null
                                    ? Image.memory(_imageBytes!,
                                        fit: BoxFit.cover)
                                    : const Center(
                                        child: CircularProgressIndicator(
                                            color: Color(0xFF6366F1))),
                              ),

                              // Landmark pins
                              LayoutBuilder(
                                builder: (_, constraints) {
                                  final cs = constraints.biggest;
                                  return Stack(
                                    children: _landmarks.entries.map((entry) {
                                      final key = entry.key;
                                      final lm = entry.value;
                                      final color =
                                          Color(lm['color'] as int);
                                      final x = (lm['x'] as double) /
                                          100 *
                                          cs.width;
                                      final y = (lm['y'] as double) /
                                          100 *
                                          cs.height;
                                      final isActive = _activeLandmark == key;

                                      return Positioned(
                                        left: x - 40,
                                        top: y - 40,
                                        child: ScaleTransition(
                                          scale: _enterAnimation,
                                          child: GestureDetector(
                                            behavior:
                                                HitTestBehavior.translucent,
                                            onPanStart: (_) => setState(
                                                () => _activeLandmark = key),
                                            onPanUpdate: (d) =>
                                                _onPanUpdate(key, d),
                                            onPanEnd: (_) => setState(
                                                () => _activeLandmark = null),
                                            child: SizedBox(
                                              width: 80,
                                              height: 80,
                                              child: Center(
                                                child: Column(
                                                  mainAxisSize:
                                                      MainAxisSize.min,
                                                  children: [
                                                    // Pin circle
                                                    AnimatedContainer(
                                                      duration:
                                                          const Duration(
                                                              milliseconds:
                                                                  150),
                                                      width: isActive
                                                          ? 28
                                                          : 22,
                                                      height: isActive
                                                          ? 28
                                                          : 22,
                                                      decoration:
                                                          BoxDecoration(
                                                        shape:
                                                            BoxShape.circle,
                                                        color: color,
                                                        border: Border.all(
                                                          color: Colors.white,
                                                          width: isActive
                                                              ? 3
                                                              : 2,
                                                        ),
                                                        boxShadow: [
                                                          BoxShadow(
                                                            color: color
                                                                .withValues(
                                                                    alpha: 0.55),
                                                            blurRadius:
                                                                isActive
                                                                    ? 14
                                                                    : 6,
                                                            spreadRadius:
                                                                isActive
                                                                    ? 3
                                                                    : 0,
                                                          ),
                                                        ],
                                                      ),
                                                      child: isActive
                                                          ? const Icon(
                                                              Icons.drag_handle,
                                                              color:
                                                                  Colors.white,
                                                              size: 14,
                                                            )
                                                          : null,
                                                    ),
                                                    const SizedBox(height: 3),
                                                    // Label pill
                                                    Container(
                                                      padding:
                                                          const EdgeInsets
                                                              .symmetric(
                                                              horizontal: 5,
                                                              vertical: 2),
                                                      decoration:
                                                          BoxDecoration(
                                                        color:
                                                            Colors.black87,
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(5),
                                                        border: Border.all(
                                                            color: color
                                                                .withValues(
                                                                    alpha: 0.6),
                                                            width: 1),
                                                      ),
                                                      child: Text(
                                                        lm['label']!
                                                            as String,
                                                        style: TextStyle(
                                                          color: isActive
                                                              ? Colors.white
                                                              : Colors.grey[
                                                                  300],
                                                          fontSize: 9,
                                                          fontWeight:
                                                              FontWeight.bold,
                                                        ),
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                      );
                                    }).toList(),
                                  );
                                },
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),

                // ── Action bar ───────────────────────────────────────────
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
                  color: const Color(0xFF111827),
                  child: Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => Navigator.pop(context),
                          icon: const Icon(Icons.replay_rounded, size: 18),
                          label: const Text('RETAKE'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.grey[400],
                            side: BorderSide(color: Colors.grey[700]!),
                            padding:
                                const EdgeInsets.symmetric(vertical: 13),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        flex: 2,
                        child: ElevatedButton.icon(
                          onPressed: _confirmView,
                          icon: const Icon(Icons.cloud_upload_rounded,
                              size: 18),
                          label: const Text(
                            'CONFIRM & UPLOAD',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF10B981),
                            foregroundColor: Colors.white,
                            padding:
                                const EdgeInsets.symmetric(vertical: 13),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildUploadingState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(
            width: 56,
            height: 56,
            child: CircularProgressIndicator(
              color: Color(0xFF10B981),
              strokeWidth: 3,
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'Uploading view…',
            style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 16),
          ),
          const SizedBox(height: 6),
          Text(
            'Sending ${widget.angle} to Supabase Storage…',
            style: TextStyle(color: Colors.grey[500], fontSize: 12),
          ),
        ],
      ),
    );
  }
}
