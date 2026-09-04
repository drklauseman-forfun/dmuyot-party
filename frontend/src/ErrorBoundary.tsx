import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { STORAGE_PREFIX } from './storage';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence: without one of these, any throw during render — a bad
 * persisted value, a WebGL context that won't initialise — unmounts the whole
 * tree to a blank white page with no way back.
 *
 * The reset button clears persisted state, because a value that crashes the
 * app on mount would otherwise crash it again on every reload.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] Unhandled error:', error, info.componentStack);
  }

  private clearSavedDataAndReload = () => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
      }
    } catch {
      // Nothing to clear if storage is unavailable — reload anyway.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary">
        <h2>Something went wrong</h2>
        <p>
          The app hit an error it couldn't recover from. Reloading usually
          fixes it. If it keeps happening, clearing your saved list, weights
          and settings should.
        </p>
        <pre>{this.state.error.message}</pre>
        <div className="error-boundary-actions">
          <button onClick={() => window.location.reload()}>Reload</button>
          <button onClick={this.clearSavedDataAndReload}>
            Clear saved data and reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
