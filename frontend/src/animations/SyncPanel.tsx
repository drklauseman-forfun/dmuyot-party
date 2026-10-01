import type { AnimationSync } from './sync';

/**
 * Under the name on the builder's first screen: whether the name's animations
 * are shared, and its PIN.
 *
 * A name nobody has protected yet asks for a PIN to be chosen, which the
 * first save sets. A protected name asks for its PIN before anything can be
 * changed, though its animations still play. With no server, it says so and
 * the builder works on this phone alone.
 */
function SyncPanel({ sync }: { sync: AnimationSync }) {
  const { state, pin, setPin, unlock, message, unshared } = sync;
  const asksForPin = state === 'unclaimed' || state === 'locked';

  return (
    <div className="sync-panel">
      {state === 'loading' && <p className="builder-note">Checking this name with the server…</p>}
      {state === 'offline' && (
        <p className="builder-note">
          Sharing isn't available right now, so animations are saved on this phone only. They'll be shared once it is.
        </p>
      )}
      {asksForPin && (
        <>
          <label className="builder-section-title" htmlFor="builder-pin">
            {state === 'unclaimed' ? 'Choose a PIN' : 'PIN'}
          </label>
          <div className="sync-pin-row">
            <input
              id="builder-pin"
              className="builder-input"
              type="password"
              value={pin}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && state === 'locked') unlock();
              }}
            />
            {state === 'locked' && (
              <button type="button" className="builder-secondary" onClick={unlock}>
                Unlock
              </button>
            )}
          </div>
          <p className="builder-note">
            {state === 'unclaimed'
              ? 'Nobody has protected this name yet. Choose a PIN of 4 or more characters: your first save sets it, and from then on changes under this name need it, on any phone.'
              : 'This name is protected. Its animations still play, but saving, deleting or importing needs its PIN. It is remembered on this phone once it works.'}
          </p>
        </>
      )}
      {state === 'unlocked' && (
        <p className="builder-note sync-ok">🔒 Protected by a PIN and unlocked on this phone — your changes are shared.</p>
      )}
      {unshared > 0 && (
        <p className="builder-note">
          {unshared === 1 ? '1 animation' : `${unshared} animations`} on this phone {unshared === 1 ? "isn't" : "aren't"}{' '}
          shared yet. Unlock the name and {unshared === 1 ? 'it goes' : 'they go'} up.
        </p>
      )}
      {message && (
        <p className="builder-error" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

export default SyncPanel;
