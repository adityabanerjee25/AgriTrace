import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Bell, CheckCircle2, ExternalLink, LoaderCircle, Send, Unplug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth.js';
import { notificationService } from '../../services/notificationService';
import { getRoleHome } from '../../utils/roleRoutes';
import './NotificationsSettings.css';
import MarketAlertSettings from '../../components/MarketAlertSettings';

const fallback = { telegram: { enabled: false, connected: false }, inApp: { enabled: true }, whatsapp: { enabled: false, phone: '' } };

export default function NotificationsSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState(fallback);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [botLink, setBotLink] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [prefs, logs] = await Promise.all([notificationService.preferences(user), notificationService.history(user)]);
      setPreferences(prefs); setHistory(logs);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }, [user]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  const connect = async () => {
    setBusy(true); setMessage('');
    try {
      const { url } = await notificationService.connectTelegram(user);
      if (url) {
        setBotLink(url);
        window.open(url, '_blank', 'noopener,noreferrer');
        setMessage('Telegram opened. Press Start in the bot, then return here and refresh the connection status.');
      } else {
        setMessage('Telegram demo chat connected. You can send a test notification now.');
        await refresh();
      }
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try { setPreferences(await notificationService.disconnectTelegram(user)); setMessage('Telegram disconnected. In-app notifications remain available.'); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const sendTest = async () => {
    setBusy(true); setMessage('');
    try { await notificationService.testTelegram(user); setMessage('Test notification sent. Check Telegram.'); await refresh(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const saveMarketAlerts = async settings => {
    setBusy(true); setMessage('');
    try { setPreferences(await notificationService.marketAlerts(user, settings)); setMessage(settings.enabled ? 'Market alerts saved. Daily checks will send matching updates to Telegram.' : 'Market alerts paused.'); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const toggle = async (channel, enabled) => {
    setBusy(true);
    try { setPreferences(await notificationService.updatePreferences(user, { [channel]: { enabled } })); setMessage('Notification preference saved.'); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  return <main className="notifications-page">
    <button className="notifications-back" onClick={() => navigate(getRoleHome(user?.role))}><ArrowLeft size={17}/> Workspace</button>
    <header><div className="notifications-icon"><Bell size={24}/></div><div><p>Settings</p><h1>Notifications</h1><span>Choose where AgriTrace sends important trade and logistics updates.</span></div></header>
    {message && <div className="notifications-message" role="status">{message}</div>}
    {botLink && !preferences.telegram.connected && <p><a href={botLink} target="_blank" rel="noopener noreferrer">Open AgriTrace bot and press Start</a></p>}
    <section className="notification-card telegram-card">
      <div><div className="channel-heading"><Send size={20}/><h2>Telegram</h2>{preferences.telegram.connected && <span><CheckCircle2 size={14}/> Connected</span>}</div><p>Price alerts, new buyer demand, and trade updates delivered to your personal AgriTrace bot chat.</p></div>
      <div className="channel-actions">
        {preferences.telegram.connected ? <><label className="switch-row"><span>Notifications</span><input type="checkbox" checked={preferences.telegram.enabled} onChange={e => toggle('telegram', e.target.checked)}/></label><button className="primary" onClick={sendTest}><Send size={16}/> Send test</button><button className="secondary danger" onClick={disconnect}><Unplug size={16}/> Disconnect</button></> : <button className="primary" onClick={connect}><ExternalLink size={16}/> Connect Telegram</button>}
        <button className="secondary" onClick={refresh}>Refresh status</button>
      </div>
    </section>
    <MarketAlertSettings key={JSON.stringify(preferences.marketAlerts || {})} settings={preferences.marketAlerts} connected={preferences.telegram.connected && preferences.telegram.enabled} busy={busy} onSave={saveMarketAlerts} />
    <section className="notification-card"><div><h2>In-app notifications</h2><p>Keep a record inside AgriTrace if Telegram is disabled or unavailable.</p></div><label className="switch-row"><span>{preferences.inApp.enabled ? 'Enabled' : 'Disabled'}</span><input type="checkbox" checked={preferences.inApp.enabled} onChange={e => toggle('inApp', e.target.checked)}/></label></section>
    <section className="history-card"><div className="history-title"><div><h2>Notification history</h2><p>Recent delivery attempts and in-app records.</p></div>{busy && <LoaderCircle className="spin" size={20}/>}</div>
      {history.length ? <div className="history-list">{history.map(item => <article key={item._id}><div><strong>{item.title || item.eventType.replaceAll('_', ' ')}</strong><p>{item.message}</p><time>{new Date(item.createdAt).toLocaleString()}</time></div><span className={`delivery ${item.status.toLowerCase()}`}>{item.channel} · {item.status}</span></article>)}</div> : <div className="empty-history">No notifications sent yet.</div>}
    </section>
  </main>;
}
