import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Paints an anatomically accurate forearm silhouette guide overlay.
/// [validationScore] 0.0–1.0 drives the colour from red→amber→green.
/// [currentAngle] e.g. 'Front', 'Left' — shows a side-specific silhouette.
/// [pulsePhase] should be driven by an AnimationController (0–1 loop) for
/// the pulsing ring effect while waiting for capture.
class ForearmGuidePainter extends CustomPainter {
  final double validationScore; // 0.0 to 1.0
  final String currentAngle;
  final double pulsePhase; // 0.0 to 1.0 (from AnimationController)
  final bool isCapturing;

  ForearmGuidePainter({
    required this.validationScore,
    required this.currentAngle,
    this.pulsePhase = 0.0,
    this.isCapturing = false,
  });

  // Lerp colour from deep red → amber → vivid green based on score
  Color get _borderColor {
    if (validationScore < 0.5) {
      return Color.lerp(
        const Color(0xFFEF4444), // red
        const Color(0xFFF59E0B), // amber
        validationScore * 2,
      )!;
    } else {
      return Color.lerp(
        const Color(0xFFF59E0B), // amber
        const Color(0xFF10B981), // green
        (validationScore - 0.5) * 2,
      )!;
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final color = _borderColor;

    final borderPaint = Paint()
      ..color = color.withOpacity(0.85)
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final fillPaint = Paint()
      ..color = color.withOpacity(0.08)
      ..style = PaintingStyle.fill;

    final dotPaint = Paint()
      ..color = color.withOpacity(0.9)
      ..style = PaintingStyle.fill;

    final shadowPaint = Paint()
      ..color = color.withOpacity(0.18)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);

    // ── 1. Determine silhouette shape based on view angle ──────────────────────
    final isLateral = currentAngle == 'Left' || currentAngle == 'Right' ||
        currentAngle == '45° Left' || currentAngle == '45° Right';

    Path silhouette;
    if (isLateral) {
      // Lateral/oblique: narrow, straighter profile
      silhouette = _buildLateralPath(w, h);
    } else {
      // Frontal/dorsal: wider at elbow, tapers to wrist
      silhouette = _buildFrontalPath(w, h);
    }

    // ── 2. Draw shadow + fill + border ────────────────────────────────────────
    canvas.drawPath(silhouette, shadowPaint);
    canvas.drawPath(silhouette, fillPaint);
    canvas.drawPath(silhouette, borderPaint);

    // ── 3. Zone landmark dots + labels ────────────────────────────────────────
    final zones = [
      (Offset(w * 0.5, h * 0.13), 'ELBOW'),
      (Offset(w * 0.5, h * 0.50), 'MID'),
      (Offset(w * 0.5, h * 0.85), 'WRIST'),
    ];

    final labelStyle = TextStyle(
      color: color.withOpacity(0.9),
      fontSize: 9,
      fontWeight: FontWeight.bold,
      letterSpacing: 1.2,
    );

    for (final (pos, label) in zones) {
      // Outer ring (pulsing when score is good)
      if (validationScore > 0.6) {
        final pulsed = Paint()
          ..color = color.withOpacity(0.3 * (1 - pulsePhase))
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5;
        canvas.drawCircle(pos, 10 + 8 * pulsePhase, pulsed);
      }

      // Solid dot
      canvas.drawCircle(pos, 5, dotPaint);
      canvas.drawCircle(pos, 5, borderPaint..color = Colors.white.withOpacity(0.7)..strokeWidth = 1.5);

      // Label background pill
      final textPainter = TextPainter(
        text: TextSpan(text: label, style: labelStyle),
        textDirection: TextDirection.ltr,
      )..layout();

      const pillPad = 4.0;
      final pillRect = RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(pos.dx + 32, pos.dy),
          width: textPainter.width + pillPad * 2,
          height: textPainter.height + pillPad,
        ),
        const Radius.circular(4),
      );
      canvas.drawRRect(pillRect, Paint()..color = Colors.black.withOpacity(0.55));
      textPainter.paint(canvas, Offset(pos.dx + 32 - textPainter.width / 2, pos.dy - textPainter.height / 2));
    }

    // ── 4. Corner tick marks (like a camera viewfinder) ──────────────────────
    _drawCornerTicks(canvas, w, h, color);

    // ── 5. Pulse ring around full guide when auto-capture pending ─────────────
    if (validationScore >= 1.0 && !isCapturing) {
      final pulseRingPaint = Paint()
        ..color = const Color(0xFF10B981).withOpacity(0.4 * (1 - pulsePhase))
        ..strokeWidth = 3
        ..style = PaintingStyle.stroke;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(-16 * pulsePhase, -16 * pulsePhase,
              w + 32 * pulsePhase, h + 32 * pulsePhase),
          const Radius.circular(24),
        ),
        pulseRingPaint,
      );
    }
  }

  Path _buildFrontalPath(double w, double h) {
    // Tapered oval: wider at top (elbow ~60% width), narrows to wrist (~40%)
    return Path()
      ..moveTo(w * 0.30, h * 0.10) // elbow-left
      ..quadraticBezierTo(w * 0.28, h * 0.50, w * 0.34, h * 0.90) // left edge
      ..lineTo(w * 0.66, h * 0.90) // wrist-right
      ..quadraticBezierTo(w * 0.72, h * 0.50, w * 0.70, h * 0.10) // right edge
      ..close();
  }

  Path _buildLateralPath(double w, double h) {
    // Narrower uniform oval for side view
    return Path()
      ..moveTo(w * 0.38, h * 0.10)
      ..quadraticBezierTo(w * 0.36, h * 0.50, w * 0.40, h * 0.90)
      ..lineTo(w * 0.60, h * 0.90)
      ..quadraticBezierTo(w * 0.64, h * 0.50, w * 0.62, h * 0.10)
      ..close();
  }

  void _drawCornerTicks(Canvas canvas, double w, double h, Color color) {
    final tickPaint = Paint()
      ..color = color.withOpacity(0.7)
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.square
      ..style = PaintingStyle.stroke;

    const len = 16.0;
    // Top-left
    canvas.drawLine(const Offset(0, len), const Offset(0, 0), tickPaint);
    canvas.drawLine(const Offset(0, 0), const Offset(len, 0), tickPaint);
    // Top-right
    canvas.drawLine(Offset(w - len, 0), Offset(w, 0), tickPaint);
    canvas.drawLine(Offset(w, 0), Offset(w, len), tickPaint);
    // Bottom-left
    canvas.drawLine(Offset(0, h - len), Offset(0, h), tickPaint);
    canvas.drawLine(Offset(0, h), Offset(len, h), tickPaint);
    // Bottom-right
    canvas.drawLine(Offset(w - len, h), Offset(w, h), tickPaint);
    canvas.drawLine(Offset(w, h), Offset(w, h - len), tickPaint);
  }

  @override
  bool shouldRepaint(ForearmGuidePainter old) =>
      old.validationScore != validationScore ||
      old.currentAngle != currentAngle ||
      old.pulsePhase != pulsePhase ||
      old.isCapturing != isCapturing;
}

/// Simple wiggle painter for the "not aligned" jitter animation
class ValidationRingPainter extends CustomPainter {
  final double progress; // 0.0 to 1.0
  final Color color;

  const ValidationRingPainter({required this.progress, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final sweepAngle = math.pi * 2 * progress;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(
      Rect.fromCenter(center: Offset(size.width / 2, size.height / 2),
          width: size.width - 4, height: size.height - 4),
      -math.pi / 2, // start at top
      sweepAngle,
      false,
      paint,
    );
  }

  @override
  bool shouldRepaint(ValidationRingPainter old) => old.progress != progress;
}
