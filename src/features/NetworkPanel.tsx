import { useState } from 'react';
import { cancelRegistrations, queryClient, refreshRecords } from '../api/client';
import { DEFAULT_NETWORK, getNetworkSettings, resetMockData, SCENARIOS, setNetworkSettings, type Scenario } from '../mocks/scenarios';

export function NetworkPanel() {
  const [settings, setSettings] = useState(getNetworkSettings);
  const [notice, setNotice] = useState('');
  return <details className="network-panel">
    <summary>Network demo settings</summary>
    <p>Simulated REST service powered by MSW. Select Success to recover and retry pending matches.</p>
    <label htmlFor="network-scenario">Network scenario</label>
    <select id="network-scenario" value={settings.scenario} onChange={event => {
      const next = { ...settings, scenario: event.target.value as Scenario };
      setSettings(next); setNetworkSettings(next);
      void queryClient.cancelQueries().then(refreshRecords);
      setNotice('Scenario applied. Pending records are preserved.');
    }}>{SCENARIOS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
    <p className="muted">Deterministic seed: {settings.seed}. Normal latency: {settings.latency}ms. Client timeout: 2500ms.</p>
    <button type="button" onClick={() => {
      void queryClient.cancelQueries().then(() => {
        cancelRegistrations();
        resetMockData(); setSettings(DEFAULT_NETWORK);
        return queryClient.resetQueries();
      });
      setNotice('Demo data reset, including confirmed and pending matches. Options are preserved.');
    }}>Reset network and demo records</button>
    <p role="status">{notice}</p>
  </details>;
}
