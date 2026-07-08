import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/supabase_service.dart';
import 'scan_screen.dart';
import 'login_screen.dart';

class CaseListScreen extends StatefulWidget {
  final String authToken;
  final String techName;

  const CaseListScreen({
    super.key,
    required this.authToken,
    required this.techName,
  });

  @override
  State<CaseListScreen> createState() => _CaseListScreenState();
}

class _CaseListScreenState extends State<CaseListScreen> {
  List<Map<String, dynamic>> _cases = [];
  bool _isLoading = true;
  String? _error;
  RealtimeChannel? _subscription;

  @override
  void initState() {
    super.initState();
    _loadCases();
    _subscribeToRealtime();
  }

  @override
  void dispose() {
    _subscription?.unsubscribe();
    super.dispose();
  }

  Future<void> _loadCases() async {
    if (!mounted) return;
    setState(() { _isLoading = true; _error = null; });
    try {
      final cases = await SupabaseService.fetchPendingCases();
      if (mounted) setState(() { _cases = cases; _isLoading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = 'Failed to load cases: $e'; _isLoading = false; });
    }
  }

  void _subscribeToRealtime() {
    _subscription = SupabaseService.subscribeToCases((cases) {
      if (mounted) setState(() => _cases = cases);
    });
  }

  void _handleSignOut() async {
    await SupabaseService.signOut();
    if (mounted) {
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0F19),
      appBar: AppBar(
        backgroundColor: const Color(0xFF111827),
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: const Color(0xFF1F2937), height: 1),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Scan Queue', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: Colors.white)),
            Text('Node: ${widget.techName}', style: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 11)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF9CA3AF)),
            onPressed: _loadCases,
            tooltip: 'Refresh',
          ),
          IconButton(
            icon: const Icon(Icons.logout_outlined, color: Color(0xFFEF4444)),
            onPressed: _handleSignOut,
            tooltip: 'Sign Out',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
          : _error != null
              ? _buildError()
              : _cases.isEmpty
                  ? _buildEmpty()
                  : _buildList(),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off_outlined, size: 56, color: Color(0xFFEF4444)),
            const SizedBox(height: 16),
            Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF9CA3AF))),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: _loadCases,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.assignment_turned_in_outlined, size: 72, color: Colors.grey[700]),
          const SizedBox(height: 16),
          const Text('Queue Clear', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 6),
          const Text('No pending scans assigned to this node.', style: TextStyle(color: Color(0xFF6B7280), fontSize: 13)),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: _loadCases,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Refresh Queue'),
            style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFF6366F1), side: const BorderSide(color: Color(0xFF6366F1))),
          ),
        ],
      ),
    );
  }

  Widget _buildList() {
    return ListView.builder(
      itemCount: _cases.length,
      padding: const EdgeInsets.all(16),
      itemBuilder: (context, index) {
        final c = _cases[index];
        final isRescan = c['status'] == 'rescan';
        return _CaseCard(
          orthoCase: c,
          isRescan: isRescan,
          authToken: widget.authToken,
          onReturn: _loadCases,
        );
      },
    );
  }
}

class _CaseCard extends StatelessWidget {
  final Map<String, dynamic> orthoCase;
  final bool isRescan;
  final String authToken;
  final VoidCallback onReturn;

  const _CaseCard({
    required this.orthoCase,
    required this.isRescan,
    required this.authToken,
    required this.onReturn,
  });

  @override
  Widget build(BuildContext context) {
    final accentColor = isRescan ? const Color(0xFFEF4444) : const Color(0xFF6366F1);
    final statusColor = isRescan ? const Color(0xFFEF4444) : const Color(0xFF0EA5E9);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accentColor.withValues(alpha: 0.25)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => ScanScreen(authToken: authToken, orthoCase: orthoCase),
            ),
          ).then((_) => onReturn());
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          orthoCase['patientName'] ?? 'Unknown Patient',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'ID: ${orthoCase['id']}',
                          style: const TextStyle(color: Color(0xFF6B7280), fontSize: 11, fontFamily: 'monospace'),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: statusColor.withValues(alpha: 0.4)),
                    ),
                    child: Text(
                      isRescan ? 'RE-SCAN' : 'PENDING',
                      style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: statusColor, letterSpacing: 0.5),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _infoChip(Icons.accessibility_new_outlined, '${orthoCase['bodyPart']} · ${orthoCase['side']}', const Color(0xFF6366F1)),
                  const SizedBox(width: 8),
                  _infoChip(Icons.person_outline, 'Age ${orthoCase['patientAge']} · ${orthoCase['patientGender']}', const Color(0xFF9CA3AF)),
                ],
              ),
              if ((orthoCase['diagnosis'] as String? ?? '').isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  orthoCase['diagnosis'],
                  style: TextStyle(
                    color: isRescan ? const Color(0xFFF87171) : const Color(0xFF6B7280),
                    fontSize: 12,
                    fontStyle: FontStyle.italic,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    'Tap to begin scan →',
                    style: TextStyle(color: accentColor, fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoChip(IconData icon, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
