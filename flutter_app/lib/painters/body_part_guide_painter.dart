import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../config/body_part_config.dart';

// ─────────────────────────────────────────────────────────────────────────────
// BodyPartGuidePainter
//
// A single, generic CustomPainter that renders the correct anatomical guide
// overlay for ANY supported body part.  All body-part-specific data comes
// from BodyPartConfig so this file never needs to be edited when new body
// parts are added — only body_part_config.dart does.
//
// Key fix over the old ForearmGuidePainter:
//   • shouldRepaint() now compares bodyPart, so the canvas always redraws
//     when the body part changes between scan sessions.
// ─────────────────────────────────────────────────────────────────────────────
class BodyPartGuidePainter extends CustomPainter {
  final double validationScore; // 0.0 – 1.0
  final String currentAngle;   // 'Front' | 'Back' | 'Left' | 'Right' | '45° Left' | '45° Right'
  final double pulsePhase;     // 0.0 – 1.0 driven by AnimationController
  final bool isCapturing;
  final String bodyPart;       // raw body-part string from the case record

  BodyPartGuidePainter({
    required this.validationScore,
    required this.currentAngle,
    this.pulsePhase = 0.0,
    this.isCapturing = false,
    this.bodyPart = 'Forearm',
  });

  // ── Colour gradient: red → amber → green ─────────────────────────────────
  Color get _borderColor {
    if (validationScore < 0.5) {
      return Color.lerp(
        const Color(0xFFEF4444),
        const Color(0xFFF59E0B),
        validationScore * 2,
      )!;
    }
    return Color.lerp(
      const Color(0xFFF59E0B),
      const Color(0xFF10B981),
      (validationScore - 0.5) * 2,
    )!;
  }

  // ── Silhouette path factories ─────────────────────────────────────────────

  /// Standard tapered vertical limb (forearm, lower-leg, upper-arm, shin)
  Path _buildVerticalLimbPath(double w, double h, {bool narrow = false}) {
    final leftEdge  = narrow ? 0.38 : 0.28;
    final rightEdge = narrow ? 0.62 : 0.72;
    return Path()
      ..moveTo(w * (0.50 - (rightEdge - leftEdge) / 2 + 0.03), h * 0.08)
      ..quadraticBezierTo(w * leftEdge,  h * 0.50, w * (leftEdge + 0.06),  h * 0.92)
      ..lineTo(w * (rightEdge - 0.06), h * 0.92)
      ..quadraticBezierTo(w * rightEdge, h * 0.50, w * (0.50 + (rightEdge - leftEdge) / 2 - 0.03), h * 0.08)
      ..close();
  }

  /// Narrow uniform oval for wrist / close-up shots
  Path _buildNarrowLimbPath(double w, double h) {
    return Path()
      ..moveTo(w * 0.37, h * 0.08)
      ..quadraticBezierTo(w * 0.35, h * 0.50, w * 0.39, h * 0.92)
      ..lineTo(w * 0.61, h * 0.92)
      ..quadraticBezierTo(w * 0.65, h * 0.50, w * 0.63, h * 0.08)
      ..close();
  }

  /// Foot shape — wider at toe end (bottom), narrow at heel (top)
  Path _buildFootPath(double w, double h) {
    return Path()
      ..moveTo(w * 0.40, h * 0.08) // heel top-left
      ..quadraticBezierTo(w * 0.28, h * 0.50, w * 0.18, h * 0.92) // outer arch
      ..lineTo(w * 0.82, h * 0.92)  // toe end right
      ..quadraticBezierTo(w * 0.72, h * 0.50, w * 0.60, h * 0.08) // inner arch
      ..close();
  }

  /// Hand shape — wide at finger tips (bottom), narrows to wrist (top)
  Path _buildHandPath(double w, double h) {
    return Path()
      ..moveTo(w * 0.38, h * 0.08)  // wrist top-left
      ..quadraticBezierTo(w * 0.24, h * 0.50, w * 0.15, h * 0.88) // outer edge
      ..lineTo(w * 0.85, h * 0.88)   // finger tips right
      ..quadraticBezierTo(w * 0.76, h * 0.50, w * 0.62, h * 0.08) // inner edge
      ..close();
  }

  /// Knee shape — symmetric with a slight bulge in the middle
  Path _buildKneePath(double w, double h) {
    return Path()
      ..moveTo(w * 0.33, h * 0.08)  // thigh top-left
      ..quadraticBezierTo(w * 0.25, h * 0.50, w * 0.31, h * 0.92) // outer edge
      ..lineTo(w * 0.69, h * 0.92)
      ..quadraticBezierTo(w * 0.75, h * 0.50, w * 0.67, h * 0.08)
      ..close();
  }

  Path _buildSilhouette(double w, double h) {
    final config = getBodyPartConfig(bodyPart);
    final isLateral = currentAngle == 'Left' || currentAngle == 'Right' ||
        currentAngle == '45° Left' || currentAngle == '45° Right';

    switch (config.shape) {
      case SilhouetteShape.narrowLimb:
        return _buildNarrowLimbPath(w, h);
      case SilhouetteShape.footShaped:
        return _buildFootPath(w, h);
      case SilhouetteShape.handShaped:
        return _buildHandPath(w, h);
      case SilhouetteShape.kneeShaped:
        return _buildKneePath(w, h);
      case SilhouetteShape.verticalLimb:
        // For lateral angles narrow the silhouette slightly
        return _buildVerticalLimbPath(w, h, narrow: isLateral);
    }
  }

  // ── Main paint ────────────────────────────────────────────────────────────
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final color = _borderColor;
    final config = getBodyPartConfig(bodyPart);

    final borderPaint = Paint()
      ..color = color.withValues(alpha: 0.85)
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final fillPaint = Paint()
      ..color = color.withValues(alpha: 0.07)
      ..style = PaintingStyle.fill;

    final dotPaint = Paint()
      ..color = color.withValues(alpha: 0.9)
      ..style = PaintingStyle.fill;

    final shadowPaint = Paint()
      ..color = color.withValues(alpha: 0.15)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10);

    // ── 1. Draw silhouette ──────────────────────────────────────────────────
    final silhouette = _buildSilhouette(w, h);
    canvas.drawPath(silhouette, shadowPaint);
    canvas.drawPath(silhouette, fillPaint);
    canvas.drawPath(silhouette, borderPaint);

    // ── 2. Landmark dots + labels ───────────────────────────────────────────
    for (final zone in config.zones) {
      final pos = Offset(w * 0.50, h * zone.yFraction);

      // Pulsing outer ring when score is high
      if (validationScore > 0.6) {
        final pulsedPaint = Paint()
          ..color = color.withValues(alpha: 0.28 * (1 - pulsePhase))
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5;
        canvas.drawCircle(pos, 10 + 8 * pulsePhase, pulsedPaint);
      }

      // Solid dot
      canvas.drawCircle(pos, 5.5, dotPaint);
      // White ring
      canvas.drawCircle(
        pos,
        5.5,
        Paint()
          ..color = Colors.white.withValues(alpha: 0.75)
          ..strokeWidth = 1.5
          ..style = PaintingStyle.stroke,
      );

      // Label pill — rendered to the right of the dot
      final labelStyle = TextStyle(
        color: color.withValues(alpha: 0.95),
        fontSize: 9.5,
        fontWeight: FontWeight.bold,
        letterSpacing: 1.1,
      );
      final textPainter = TextPainter(
        text: TextSpan(text: zone.label, style: labelStyle),
        textDirection: TextDirection.ltr,
      )..layout();

      const pillPadH = 5.0;
      const pillPadV = 3.5;
      const dotOffset = 13.0; // gap between dot centre and pill left edge

      final pillLeft = pos.dx + dotOffset;
      final pillRect = RRect.fromRectAndRadius(
        Rect.fromLTWH(
          pillLeft,
          pos.dy - textPainter.height / 2 - pillPadV,
          textPainter.width + pillPadH * 2,
          textPainter.height + pillPadV * 2,
        ),
        const Radius.circular(4),
      );
      canvas.drawRRect(
          pillRect, Paint()..color = Colors.black.withValues(alpha: 0.60));
      textPainter.paint(
        canvas,
        Offset(pillLeft + pillPadH, pos.dy - textPainter.height / 2),
      );
    }

    // ── 3. Corner viewfinder ticks ──────────────────────────────────────────
    _drawCornerTicks(canvas, w, h, color);

    // ── 4. Full-guide pulse ring when auto-capture is pending ───────────────
    if (validationScore >= 1.0 && !isCapturing) {
      final pulseRingPaint = Paint()
        ..color = const Color(0xFF10B981).withValues(alpha: 0.38 * (1 - pulsePhase))
        ..strokeWidth = 3
        ..style = PaintingStyle.stroke;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(
            -16 * pulsePhase,
            -16 * pulsePhase,
            w + 32 * pulsePhase,
            h + 32 * pulsePhase,
          ),
          const Radius.circular(24),
        ),
        pulseRingPaint,
      );
    }
  }

  void _drawCornerTicks(Canvas canvas, double w, double h, Color color) {
    final tickPaint = Paint()
      ..color = color.withValues(alpha: 0.7)
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

  // ── shouldRepaint — MUST include bodyPart (the original bug) ───────────────
  @override
  bool shouldRepaint(BodyPartGuidePainter old) =>
      old.validationScore != validationScore ||
      old.currentAngle != currentAngle ||
      old.pulsePhase != pulsePhase ||
      old.isCapturing != isCapturing ||
      old.bodyPart != bodyPart; // ← Critical fix
}

// ─────────────────────────────────────────────────────────────────────────────
// ValidationRingPainter (unchanged helper, kept here for single import)
// ─────────────────────────────────────────────────────────────────────────────
class ValidationRingPainter extends CustomPainter {
  final double progress;
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
      Rect.fromCenter(
          center: Offset(size.width / 2, size.height / 2),
          width: size.width - 4,
          height: size.height - 4),
      -math.pi / 2,
      sweepAngle,
      false,
      paint,
    );
  }

  @override
  bool shouldRepaint(ValidationRingPainter old) => old.progress != progress;
}
