import type { IAttendanceAdapter } from './adapter.interface';
import { DefaultBiometricAdapter } from './adapters/default-biometric.adapter';
import { BioSyncAdapter } from './adapters/biosync.adapter';

// ─────────────────────────────────────────────────────────────────────────────
// AdapterRegistry
//
// Add new adapters here as the institution adds new data sources.
// Adapters are tried in order — first match wins.
// ─────────────────────────────────────────────────────────────────────────────

const adapters: IAttendanceAdapter[] = [
  new BioSyncAdapter(),       // BioSync aggregator format (Emp Code + Punch Records)
  new DefaultBiometricAdapter(),
  // Add new adapters here:
  // new AnotherFormatAdapter(),
];

export function detectAdapter(headers: string[]): IAttendanceAdapter {
  for (const adapter of adapters) {
    if (adapter.canHandle(headers)) {
      return adapter;
    }
  }
  throw new Error(
    `No adapter found for columns: [${headers.join(', ')}]. ` +
    `Register a new adapter in src/parser/adapterRegistry.ts`,
  );
}

export { adapters };
