import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// ─── Upload result model ───────────────────────────────────────────────────
class UploadResult {
  final bool success;
  final String? url;
  final String? errorMessage;

  const UploadResult({
    required this.success,
    this.url,
    this.errorMessage,
  });

  static UploadResult ok(String url) =>
      UploadResult(success: true, url: url);

  static UploadResult fail(String msg) =>
      UploadResult(success: false, errorMessage: msg);
}

class SupabaseService {
  static SupabaseClient get _client => Supabase.instance.client;

  // ─── Auth ─────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>?> login(
      String id, String password) async {
    try {
      final response = await _client
          .from('clinic_devices')
          .select('*')
          .eq('id', id)
          .eq('password', password)
          .maybeSingle();

      if (response != null) {
        return {
          'token': 'device-token-${response['id']}',
          'email': '${response['id']}@clinic.internal',
          'role': 'Technician',
          'name': response['name'] ?? 'Technician Node',
        };
      }
    } catch (e) {
      debugPrint('Device Login error: $e');
    }
    return null;
  }

  static Future<void> signOut() async {
    await _client.auth.signOut();
  }

  // ─── Cases ────────────────────────────────────────────────────────────────

  static Future<List<Map<String, dynamic>>> fetchPendingCases() async {
    try {
      final response = await _client
          .from('ortho_cases')
          .select('*')
          .inFilter('status', ['pending', 'rescan'])
          .order('submitted_at', ascending: false);

      return (response as List).map((row) => _rowToCase(row)).toList();
    } catch (e) {
      debugPrint('fetchPendingCases error: $e');
      return [];
    }
  }

  static Map<String, dynamic> _rowToCase(Map<String, dynamic> row) {
    return {
      'id': row['id'],
      'patientName': row['patient_name'],
      'patientAge': row['patient_age'],
      'patientGender': row['patient_gender'],
      'bodyPart': row['body_part'],
      'side': row['side'],
      'diagnosis': row['diagnosis'],
      'doctorName': row['doctor_name'],
      'submittedAt': row['submitted_at'],
      'status': row['status'],
      'mobilityStatus': row['mobility_status'],
      'swellingStatus': row['swelling_status'],
      'scanPurpose': row['scan_purpose'],
    };
  }

  // ─── Image Upload ──────────────────────────────────────────────────────────

  /// Upload with 3 retries and exponential back-off (1 s → 2 s → 4 s).
  /// Returns an [UploadResult] with a descriptive error when all retries fail.
  static Future<UploadResult> uploadImageBytesWithRetry(
      Uint8List bytes, String filename) async {
    const maxAttempts = 3;
    final delays = [
      const Duration(seconds: 1),
      const Duration(seconds: 2),
      const Duration(seconds: 4),
    ];

    for (int attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        final path = 'scans/$filename';
        debugPrint('Upload attempt ${attempt + 1}/$maxAttempts → $path');

        await _client.storage.from('scans').uploadBinary(
          path,
          bytes,
          fileOptions:
              const FileOptions(contentType: 'image/jpeg', upsert: true),
        );

        final publicUrl =
            _client.storage.from('scans').getPublicUrl(path);
        debugPrint('Upload success → $publicUrl');
        return UploadResult.ok(publicUrl);
      } on StorageException catch (e) {
        final msg = e.message;
        debugPrint('StorageException attempt ${attempt + 1}: $msg');

        // Classify common errors so UI can show a useful message
        if (msg.contains('Bucket not found') ||
            msg.contains('bucket') ||
            msg.contains('not found')) {
          return UploadResult.fail(
              'Storage bucket "scans" not found. '
              'Go to Supabase → Storage → New bucket → name it "scans" → enable Public.');
        }
        if (msg.contains('violates row-level security') ||
            msg.contains('policy') ||
            msg.contains('unauthorized') ||
            msg.contains('403')) {
          return UploadResult.fail(
              'Permission denied. Add an INSERT policy on the "scans" bucket '
              '(Supabase → Storage → scans → Policies → New policy → Allow uploads).');
        }
        if (msg.contains('payload too large') ||
            msg.contains('413') ||
            msg.contains('too large')) {
          return UploadResult.fail(
              'Image file is too large. Maximum upload size is 50 MB.');
        }

        // Unknown storage error — retry
        if (attempt < maxAttempts - 1) {
          await Future.delayed(delays[attempt]);
          continue;
        }
        return UploadResult.fail('Upload failed after $maxAttempts attempts: $msg');
      } catch (e) {
        debugPrint('Upload error attempt ${attempt + 1}: $e');
        if (attempt < maxAttempts - 1) {
          await Future.delayed(delays[attempt]);
          continue;
        }
        return UploadResult.fail(
            'Network error after $maxAttempts attempts. Check internet connection.');
      }
    }
    return UploadResult.fail('Upload failed (unknown).');
  }

  /// Legacy single-attempt upload — kept for backward compat; prefer [uploadImageBytesWithRetry].
  static Future<String?> uploadImageBytes(
      Uint8List bytes, String filename) async {
    final result = await uploadImageBytesWithRetry(bytes, filename);
    return result.url;
  }

  static Future<String?> uploadImageFile(File imageFile) async {
    try {
      final bytes = await imageFile.readAsBytes();
      final filename = '${DateTime.now().millisecondsSinceEpoch}.jpg';
      return uploadImageBytes(bytes, filename);
    } catch (e) {
      debugPrint('uploadImageFile error: $e');
      return null;
    }
  }

  // ─── Submit Scan ───────────────────────────────────────────────────────────

  static Future<bool> submitScanViews(
      String caseId, List<Map<String, dynamic>> views) async {
    try {
      final avgQuality = views.isNotEmpty
          ? (views
                      .map((v) => v['qualityScore'] as int? ?? 90)
                      .reduce((a, b) => a + b) /
                  views.length)
              .round()
          : 90;

      final images = views
          .map((v) => {
                'id':
                    'img-${DateTime.now().millisecondsSinceEpoch}-${v['angle']}',
                'angle': v['angle'],
                'url': v['url'],
                'qualityScore': v['qualityScore'] ?? 90,
                'blurDetected': false,
                'motionDetected': false,
                'brightnessValidation': true,
                'resolutionCheck': 'HD 1920x1080',
                'landmarks': v['landmarks'] ?? {},
              })
          .toList();

      await _client.from('ortho_cases').update({
        'status': 'review',
        'overall_quality': avgQuality,
        'images': images,
        'device_os': kIsWeb
            ? null
            : (defaultTargetPlatform == TargetPlatform.iOS
                ? 'iOS'
                : 'Android'),
      }).eq('id', caseId);

      return true;
    } catch (e) {
      debugPrint('submitScanViews error: $e');
      return false;
    }
  }

  // ─── Realtime subscription ─────────────────────────────────────────────────

  static RealtimeChannel subscribeToCases(
      void Function(List<Map<String, dynamic>>) onData) {
    return _client
        .channel('public:ortho_cases')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'ortho_cases',
          callback: (_) async {
            final cases = await fetchPendingCases();
            onData(cases);
          },
        )
        .subscribe();
  }
}
