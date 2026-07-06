import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import '../services/supabase_service.dart';

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
    final bodyPart = widget.orthoCase['bodyPart'] ?? 'Wrist';

    if (bodyPart == 'Forearm') {
      _landmarks = {
        'proximal': {'label': 'Elbow Crease', 'x': 50.0, 'y': 18.0, 'color': 0xFFEF4444},
        'mid': {'label': 'Mid Forearm', 'x': 50.0, 'y': 50.0, 'color': 0xFFF59E0B},
        'distal': {'label': 'Wrist Joint', 'x': 50.0, 'y': 82.0, 'color': 0xFF10B981},
      };
    } else if (bodyPart == 'Wrist') {
      _landmarks = {
        'proximal': {'label': 'Distal Forearm', 'x': 50.0, 'y': 25.0, 'color': 0xFFEF4444},
        'mid': {'label': 'Wrist Crease', 'x': 50.0, 'y': 50.0, 'color': 0xFFF59E0B},
        'distal': {'label': 'MCP Joint', 'x': 50.0, 'y': 75.0, 'color': 0xFF10B981},
      };
    } else if (bodyPart == 'Ankle') {
      _landmarks = {
        'proximal': {'label': 'Calf Base', 'x': 50.0, 'y': 22.0, 'color': 0xFFEF4444},
        'mid': {'label': 'Lateral Malleolus', 'x': 50.0, 'y': 62.0, 'color': 0xFFF59E0B},
        'distal': {'label': 'Heel Base', 'x': 50.0, 'y': 82.0, 'color': 0xFF10B981},
      };
    } else {
      _landmarks = {
        'proximal': {'label': 'Upper Arm', 'x': 50.0, 'y': 25.0, 'color': 0xFFEF4444},
        'mid': {'label': 'Olecranon', 'x': 50.0, 'y': 52.0, 'color': 0xFFF59E0B},
        'distal': {'label': 'Prox. Forearm', 'x': 50.0, 'y': 75.0, 'color': 0xFF10B981},
      };
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
            Text(
              'Adjust Landmarks',
              style: const TextStyle(color: Colors.white, fontSize: 15),
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
                                                                .withOpacity(
                                                                    0.55),
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
                                                                .withOpacity(
                                                                    0.6),
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
