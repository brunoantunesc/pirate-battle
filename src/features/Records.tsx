import { useEffect, useState } from 'react';
import type { GameConfig } from '../game/config';
import { errorMessage, usePendingMatches, useRecords, useRetryPending } from '../api/client';

export function Records({ config }: { config: GameConfig }) {
  const [tab, setTab] = useState<'ranking' | 'history'>('ranking');
  const [page, setPage] = useState(1);
  const query = useRecords(tab, page, config);
  const pending = usePendingMatches();
  const retry = useRetryPending();
  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 5)));
  useEffect(() => {
    if (query.data && page > pages) setPage(pages);
  }, [query.data, page, pages]);
  return <section className="records panel" aria-label="Captain records">
    <div className="tabs" role="group" aria-label="Records view">
      <button type="button" aria-pressed={tab === 'ranking'} onClick={() => { setTab('ranking'); setPage(1); }}>Ranking</button>
      <button type="button" aria-pressed={tab === 'history'} onClick={() => { setTab('history'); setPage(1); }}>Match History</button>
    </div>
    <h2>{tab === 'ranking' ? 'Legends of the sea' : "Captain’s log"}</h2>
    <p className="muted">{tab === 'ranking' ? 'Captains competing with your current game configuration.' : 'Your completed voyages. Abandoned matches are never recorded.'}</p>
    {pending.length > 0 && <div className="pending-notice" role="status">
      <p>{pending.length} match{pending.length === 1 ? '' : 'es'} awaiting registration. You can keep playing.</p>
      <button type="button" disabled={retry.isPending} onClick={() => retry.mutate()}>{retry.isPending ? 'Retrying…' : 'Retry pending matches'}</button>
      {retry.error && <p role="alert">{errorMessage(retry.error)}</p>}
    </div>}
    {query.isPending ? <p role="status">Loading records…</p> : query.isError ? <div role="alert"><p>{errorMessage(query.error)}</p><button type="button" onClick={() => void query.refetch()}>Retry records</button></div> : <>
      {query.isFetching && <p role="status" className="muted">Updating records…</p>}
      {query.data.items.length === 0 ? <p className="empty-state">{tab === 'ranking' ? 'No captains on this chart yet.' : 'No completed voyages yet. Set sail to begin your log.'}</p> : <div className="table-scroll"><table>
        <caption className="sr-only">{tab === 'ranking' ? 'Ranking' : 'Match history'}, page {page}</caption>
        <thead><tr>{tab === 'ranking' ? <><th scope="col">Rank</th><th scope="col">Captain</th></> : <th scope="col">Date</th>}<th scope="col">Score</th><th scope="col">Time</th>{tab === 'history' && <th scope="col">Result</th>}</tr></thead>
        <tbody>{query.data.items.map((record, index) => <tr key={record.id}>
          {tab === 'ranking' ? <><td>{(page - 1) * query.data.pageSize + index + 1}</td><th scope="row">{record.playerName}</th></> : <th scope="row"><time dateTime={record.finishedAt}>{new Date(record.finishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</time></th>}
          <td>{record.score}</td><td>{Math.floor(record.duration)}s</td>{tab === 'history' && <td>{record.reason === 'death' ? 'Ship sunk' : 'Survived'}</td>}
        </tr>)}</tbody>
      </table></div>}
      <nav className="pagination" aria-label="Record pages">
        <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1}>Previous</button>
        <span aria-live="polite">Page {page} of {pages}</span>
        <button type="button" onClick={() => setPage(value => value + 1)} disabled={page >= pages}>Next</button>
      </nav>
    </>}
  </section>;
}
