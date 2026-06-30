import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bell,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Fingerprint,
  Gauge,
  LogOut,
  Moon,
  RefreshCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

type Theme = 'light' | 'dark';
type View = 'dashboard' | 'cases' | 'customers' | 'accounts' | 'transactions' | 'ledger' | 'webhooks' | 'audit';

type QueueHealth = { name: string; status?: string; waiting: number; active?: number; delayed?: number; failed: number };
type RecordItem = Record<string, any>;

type Dashboard = {
  metrics: {
    customers: number;
    virtualAccounts: number;
    transactions: number;
    openCases: number;
    reconciliationRate: number;
    webhookFailures: number;
    downstreamWebhookFailures?: number;
  };
  customers: RecordItem[];
  virtualAccounts: RecordItem[];
  transactions: RecordItem[];
  reconciliationCases: RecordItem[];
  openCases: RecordItem[];
  ledgerEntries: RecordItem[];
  auditLogs: RecordItem[];
  webhookEvents: RecordItem[];
  webhookDeliveries: RecordItem[];
  recentTransactions: RecordItem[];
  recentLedgerEntries: RecordItem[];
  recentAuditLogs: RecordItem[];
  queueHealth: QueueHealth[];
};

type Column = {
  label: string;
  render: (row: RecordItem) => ReactNode;
};

async function api<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = await response.json();
  if (!json.success) {
    throw new Error(json.error?.message ?? 'Request failed');
  }
  return json.data as T;
}

function shortId(value?: string) {
  if (!value) return '-';
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function money(value?: string | number, currency = 'NGN') {
  const amount = Number(value ?? 0);
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusTone(status?: string) {
  const value = String(status ?? '').toLowerCase();
  if (['active', 'up', 'received', 'verified', 'reconciled', 'approved', 'auto_reconciled'].includes(value)) return 'green';
  if (['open', 'under_review', 'awaiting_proof', 'manual_review', 'pending_verification', 'restricted'].includes(value)) return 'amber';
  if (['failed', 'rejected', 'closed', 'signature_failed', 'replay_rejected', 'signature_header_unsupported'].includes(value)) return 'red';
  return 'neutral';
}

function matchesSearch(row: RecordItem, query: string) {
  if (!query.trim()) return true;
  return JSON.stringify(row).toLowerCase().includes(query.toLowerCase());
}

function EmptyState({ label }: { label: string }) {
  return <div className="emptyState">{label}</div>;
}

function StatusBadge({ value }: { value?: string }) {
  return <span className="statusBadge" data-tone={statusTone(value)}>{value ?? '-'}</span>;
}

function DataTable({ title, eyebrow, rows, columns, emptyLabel }: {
  title: string;
  eyebrow: string;
  rows: RecordItem[];
  columns: Column[];
  emptyLabel: string;
}) {
  return (
    <div className="panel tablePanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span className="toolbarMeta">{rows.length} shown</span>
      </div>
      {rows.length === 0 ? <EmptyState label={emptyLabel} /> : (
        <div className="tableScroller">
          <table className="dataTable">
            <thead>
              <tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id ?? `${title}-${index}`}>
                  {columns.map((column) => <td key={column.label}>{column.render(row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem('portapay_admin_token') ?? '');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('portapay_admin_theme') as Theme | null) ?? 'light');
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('portapay_admin_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark');

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const data = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('portapay_admin_token', data.accessToken);
      setToken(data.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to login');
    }
  };

  const logout = () => {
    localStorage.removeItem('portapay_admin_token');
    setToken('');
    setDashboard(null);
  };

  const loadDashboard = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setDashboard(await api<Dashboard>('/admin/dashboard', undefined, token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [token]);

  const metrics = useMemo(() => [
    { label: 'Reconciliation rate', value: `${dashboard?.metrics.reconciliationRate ?? 0}%`, delta: 'auto-credit accuracy', icon: CheckCircle2, tone: 'green' },
    { label: 'Manual review', value: String(dashboard?.metrics.openCases ?? 0), delta: 'open cases', icon: AlertTriangle, tone: 'amber' },
    { label: 'Transactions', value: String(dashboard?.metrics.transactions ?? 0), delta: 'verified pipeline', icon: Banknote, tone: 'purple' },
    { label: 'Webhook failures', value: String((dashboard?.metrics.webhookFailures ?? 0) + (dashboard?.metrics.downstreamWebhookFailures ?? 0)), delta: 'provider + downstream', icon: Activity, tone: 'red' },
  ], [dashboard]);

  const filterRows = (rows?: RecordItem[]) => (rows ?? []).filter((row) => matchesSearch(row, query));

  const runCaseAction = async (caseId: string, action: string) => {
    setLoading(true);
    setError(null);
    try {
      await api(`/reconciliation/cases/${caseId}/${action}`, { method: 'POST' }, token);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update case');
    } finally {
      setLoading(false);
    }
  };

  const ThemeIcon = theme === 'dark' ? Sun : Moon;
  const themeTitle = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const navItems: Array<{ view: View; label: string; icon: typeof Gauge }> = [
    { view: 'dashboard', label: 'Dashboard', icon: Gauge },
    { view: 'cases', label: 'Cases', icon: AlertTriangle },
    { view: 'customers', label: 'Customers', icon: Fingerprint },
    { view: 'accounts', label: 'Accounts', icon: CircleDollarSign },
    { view: 'transactions', label: 'Transactions', icon: Banknote },
    { view: 'ledger', label: 'Ledger', icon: FileText },
    { view: 'webhooks', label: 'Webhooks', icon: Activity },
    { view: 'audit', label: 'Audit', icon: ShieldCheck },
  ];

  const pageTitle: Record<View, string> = {
    dashboard: 'Payment Reconciliation',
    cases: 'Manual Case Queue',
    customers: 'Customer Identity',
    accounts: 'Dedicated Accounts',
    transactions: 'Transactions',
    ledger: 'Ledger Entries',
    webhooks: 'Webhook Operations',
    audit: 'Audit Trail',
  };

  const renderCaseList = (rows: RecordItem[], compact = false) => (
    <div className="caseList">
      {rows.length === 0 && <EmptyState label="No reconciliation cases found." />}
      {rows.map((item) => (
        <article className="caseRow" key={item.id}>
          <div>
            <strong>{item.reasonCode}</strong>
            <span>{item.id}</span>
          </div>
          <div>
            <strong>{item.recommendedAction}</strong>
            <span>{item.reason}</span>
          </div>
          <div className="score" style={{ '--score': `${item.metadata?.confidenceScore ?? 0}%` } as React.CSSProperties}>
            <span>{item.metadata?.confidenceScore ?? 0}</span>
          </div>
          <div className="caseActions">
            <button onClick={() => runCaseAction(item.id, 'approve-credit')}>Approve</button>
            <button onClick={() => runCaseAction(item.id, 'request-proof')}>Proof</button>
            {!compact && <button onClick={() => runCaseAction(item.id, 'reject-refund-required')}>Refund</button>}
            <button onClick={() => runCaseAction(item.id, 'mark-duplicate')}>Duplicate</button>
            {!compact && <button onClick={() => runCaseAction(item.id, 'mark-suspicious')}>Suspicious</button>}
          </div>
        </article>
      ))}
    </div>
  );

  const renderDashboard = () => (
    <>
      <section className="metricsGrid" aria-label="Reconciliation metrics">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="metricCard" key={metric.label} data-tone={metric.tone}>
              <div className="metricCardTop">
                <span>{metric.label}</span>
                <div className="metricIcon"><Icon size={20} /></div>
              </div>
              <strong>{metric.value}</strong>
              <small>{metric.delta}</small>
            </article>
          );
        })}
      </section>

      <section className="workArea">
        <div className="panel casesPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Manual queue</p>
              <h2>Open reconciliation cases</h2>
            </div>
            <button className="textButton" onClick={loadDashboard}><RefreshCcw size={16} />Refresh</button>
          </div>
          {renderCaseList(filterRows(dashboard?.openCases), true)}
        </div>

        <div className="panel queuePanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">BullMQ</p>
              <h2>Queue health</h2>
            </div>
            <Clock3 size={18} />
          </div>
          <div className="queueList">
            {(dashboard?.queueHealth ?? []).map((queue) => (
              <div className="queueRow" key={queue.name}>
                <span>{queue.name}</span>
                <strong>{queue.waiting}</strong>
                <small>{queue.failed} failed</small>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );

  const renderActiveView = () => {
    if (activeView === 'dashboard') return renderDashboard();
    if (activeView === 'cases') return (
      <section className="contentBand">
        <div className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Manual operations</p>
              <h2>All reconciliation cases</h2>
            </div>
            <span className="toolbarMeta">{filterRows(dashboard?.reconciliationCases).length} cases</span>
          </div>
          {renderCaseList(filterRows(dashboard?.reconciliationCases))}
        </div>
      </section>
    );
    if (activeView === 'customers') return (
      <section className="contentBand">
        <DataTable title="Customers" eyebrow="Identity registry" rows={filterRows(dashboard?.customers)} emptyLabel="No customers found." columns={[
          { label: 'Customer', render: (row) => <><strong>{row.fullName}</strong><span>{row.email ?? row.phoneNumber ?? '-'}</span></> },
          { label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
          { label: 'KYC', render: (row) => <StatusBadge value={row.kycTier} /> },
          { label: 'Reference', render: (row) => <span className="mono">{row.externalReference ?? '-'}</span> },
          { label: 'Created', render: (row) => formatDate(row.createdAt) },
        ]} />
      </section>
    );
    if (activeView === 'accounts') return (
      <section className="contentBand">
        <DataTable title="Virtual accounts" eyebrow="Nomba DVA" rows={filterRows(dashboard?.virtualAccounts)} emptyLabel="No virtual accounts found." columns={[
          { label: 'Account', render: (row) => <><strong>{row.accountNumber}</strong><span>{row.accountName}</span></> },
          { label: 'Bank', render: (row) => row.bankName ?? '-' },
          { label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
          { label: 'Provider ID', render: (row) => <span className="mono">{shortId(row.providerAccountId)}</span> },
          { label: 'Created', render: (row) => formatDate(row.createdAt) },
        ]} />
      </section>
    );
    if (activeView === 'transactions') return (
      <section className="contentBand">
        <DataTable title="Transactions" eyebrow="Inbound transfers" rows={filterRows(dashboard?.transactions)} emptyLabel="No transactions found." columns={[
          { label: 'Reference', render: (row) => <><strong className="mono">{shortId(row.providerReference)}</strong><span>{shortId(row.nombaReference)}</span></> },
          { label: 'Amount', render: (row) => money(row.amount, row.currency) },
          { label: 'Sender', render: (row) => <><strong>{row.senderName ?? '-'}</strong><span>{row.senderAccountNumber ?? '-'}</span></> },
          { label: 'Recipient', render: (row) => <span className="mono">{row.recipientAccountNumber}</span> },
          { label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
          { label: 'Verified', render: (row) => formatDate(row.verifiedAt) },
        ]} />
      </section>
    );
    if (activeView === 'ledger') return (
      <section className="contentBand">
        <DataTable title="Ledger entries" eyebrow="Append-only money ledger" rows={filterRows(dashboard?.ledgerEntries)} emptyLabel="No ledger entries found." columns={[
          { label: 'Reference', render: (row) => <span className="mono">{shortId(row.reference)}</span> },
          { label: 'Type', render: (row) => row.entryType },
          { label: 'Direction', render: (row) => <StatusBadge value={row.direction} /> },
          { label: 'Amount', render: (row) => money(row.amount, row.currency) },
          { label: 'Narration', render: (row) => row.narration },
          { label: 'Created', render: (row) => formatDate(row.createdAt) },
        ]} />
      </section>
    );
    if (activeView === 'webhooks') return (
      <section className="contentBand splitGrid">
        <DataTable title="Provider webhooks" eyebrow="Nomba intake" rows={filterRows(dashboard?.webhookEvents)} emptyLabel="No provider webhooks found." columns={[
          { label: 'Provider event', render: (row) => <span className="mono">{shortId(row.providerEventId)}</span> },
          { label: 'Provider', render: (row) => row.provider },
          { label: 'Signature', render: (row) => <StatusBadge value={row.signatureValid ? 'VALID' : 'FAILED'} /> },
          { label: 'Replay', render: (row) => <StatusBadge value={row.replayProtected ? 'PROTECTED' : 'REJECTED'} /> },
          { label: 'Status', render: (row) => <StatusBadge value={row.processingStatus} /> },
        ]} />
        <DataTable title="Downstream deliveries" eyebrow="Subscriber dispatch" rows={filterRows(dashboard?.webhookDeliveries)} emptyLabel="No downstream deliveries found." columns={[
          { label: 'Event', render: (row) => row.eventType },
          { label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
          { label: 'Attempts', render: (row) => row.attempts ?? 0 },
          { label: 'Next retry', render: (row) => formatDate(row.nextAttemptAt) },
        ]} />
      </section>
    );
    return (
      <section className="contentBand">
        <DataTable title="Audit logs" eyebrow="Money-impacting actions" rows={filterRows(dashboard?.auditLogs)} emptyLabel="No audit logs found." columns={[
          { label: 'Event', render: (row) => <><strong>{row.eventType}</strong><span>{row.actorType}</span></> },
          { label: 'Entity', render: (row) => <><strong>{row.entityType}</strong><span className="mono">{shortId(row.entityId)}</span></> },
          { label: 'Actor', render: (row) => row.actorId ?? row.actorType ?? '-' },
          { label: 'Created', render: (row) => formatDate(row.createdAt) },
        ]} />
      </section>
    );
  };

  if (!token) {
    return (
      <main className="loginShell">
        <button className="loginThemeToggle" type="button" onClick={toggleTheme} title={themeTitle} aria-label={themeTitle}>
          <ThemeIcon size={18} />
        </button>
        <form className="loginPanel" onSubmit={login}>
          <div className="brand loginBrand">
            <div className="brandMark"><CircleDollarSign size={24} /></div>
            <div>
              <strong>PortaPay</strong>
              <span>Core Admin</span>
            </div>
          </div>
          <div className="loginCopy">
            <h1>Sign in</h1>
          </div>
          {error && <div className="notice inPanel">{error}</div>}
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" /></label>
          <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label>
          <button className="primaryButton">Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark"><CircleDollarSign size={24} /></div>
          <div>
            <strong>PortaPay</strong>
            <span>Core Admin</span>
          </div>
        </div>

        <div className="navGroup">
          <p>Operations</p>
          <nav>
            {navItems.slice(0, 4).map((item) => {
              const Icon = item.icon;
              return <button key={item.view} className={`navItem ${activeView === item.view ? 'active' : ''}`} onClick={() => setActiveView(item.view)}><Icon size={18} />{item.label}</button>;
            })}
          </nav>
        </div>

        <div className="navGroup">
          <p>Money movement</p>
          <nav>
            {navItems.slice(4).map((item) => {
              const Icon = item.icon;
              return <button key={item.view} className={`navItem ${activeView === item.view ? 'active' : ''}`} onClick={() => setActiveView(item.view)}><Icon size={18} />{item.label}</button>;
            })}
          </nav>
        </div>

        <div className="secureBox">
          <ShieldCheck size={18} />
          <span>Money-impacting actions are audited and protected by admin authentication.</span>
        </div>

        <div className="sidebarProfile">
          <button className="sidebarUser" type="button" title="Admin profile">
            <span>PA</span>
            <div>
              <strong>PortaPay Admin</strong>
              <small>Operations</small>
            </div>
          </button>
          <button className="sidebarSignOut" type="button" onClick={logout} title="Sign out" aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <label className="search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers, accounts, references" />
          </label>
          <div className="topbarActions">
            <button className="iconButton" title="Refresh dashboard" onClick={loadDashboard}><RefreshCcw size={18} /></button>
            <button className="iconButton" title="Notifications"><Bell size={18} /></button>
            <button className="iconButton" title="Settings"><SlidersHorizontal size={18} /></button>
            <button className="iconButton" type="button" onClick={toggleTheme} title={themeTitle} aria-label={themeTitle}>
              <ThemeIcon size={18} />
            </button>
          </div>
        </header>

        <div className="pageHeader">
          <div>
            <p className="eyebrow">Nomba DVA operations</p>
            <h1>{pageTitle[activeView]}</h1>
            <span>Track verified transfers, edge-case reviews, queue health, and audited case decisions.</span>
          </div>
          <div className="statusPill" data-state={loading ? 'syncing' : 'ready'}>
            <span />
            {loading ? 'Syncing data' : 'Live operations'}
          </div>
        </div>

        {error && <div className="notice">{error}</div>}
        {loading && <div className="notice">Loading operations data...</div>}
        {renderActiveView()}
      </section>
    </main>
  );
}