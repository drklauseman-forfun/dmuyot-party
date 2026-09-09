interface HelpModalProps {
  onClose: () => void;
}

/**
 * How the wheel works, for someone opening it for the first time.
 *
 * Everything here describes behaviour that is decided elsewhere — the parser's
 * rules, how weights are keyed, when the wheel is skipped. If one of those
 * changes, this text is wrong until someone updates it.
 */
function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal help-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>How this works</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer', padding: 0 }}>✕</button>
        </div>

        <p>
          Paste a link to a Google Doc, or type the names in yourself, and press
          Load Characters. Then spin.
        </p>

        <h3>What counts as a character</h3>
        <p>
          Only numbered lines. A line has to start with a number, or be an item
          in a numbered list. Bulleted lists are never characters, and neither
          is ordinary paragraph text — so headings, notes and rules in the same
          document are left alone.
        </p>
        <p>
          The number is stripped off, so <code>7. Sam</code> becomes{' '}
          <code>Sam</code>. If there's a colon, everything after it is dropped:{' '}
          <code>Sam (Megabears 1): the tall one</code> is stored as{' '}
          <code>Sam (Megabears 1)</code>. The part in brackets stays, which is
          how two characters with the same name stay apart.
        </p>
        <p>
          Names that are themselves numbers survive intact — <code>1.5</code>{' '}
          stays <code>1.5</code>, and <code>10-20 Squad</code> keeps its range.
          Text colour comes across from the document too, which is why some
          names are coloured in the list. Black text is flipped to white so it
          stays readable here.
        </p>
        <p>
          The document has to be shared as "Anyone with the link" or it can't be
          read at all.
        </p>
        <p>
          You can skip the document entirely and paste or type a plain list
          instead. Typed in by hand, every non-empty line counts, numbered or
          not.
        </p>

        <h3>Weights</h3>
        <p>
          Everyone starts at 1. The number is how many entries someone gets, so
          a character on 3 is three times as likely as one on 1, and their slice
          of the wheel is three times as wide.
        </p>
        <p>
          Set someone to 0 and they come off the wheel but stay in the list, so
          you can put them back without reloading. Reset puts everyone back to
          1.
        </p>
        <p>
          Loading a new list also resets every weight to 1. Weights are tied to
          positions in the document rather than to names, so carrying them over
          would quietly apply the old tuning to whoever now sits in those slots.
        </p>
        <p>
          If everything is on 0 there's nothing to land on, and the winner comes
          back as VOID.
        </p>

        <h3>Ranges</h3>
        <p>
          Include Ranges narrows the wheel down without changing the list.{' '}
          <code>1-10</code> uses the first ten; <code>1-10, 25, 40-50</code>{' '}
          uses three separate chunks. The numbers are the ones shown beside each
          name. Leave it empty to use everyone.
        </p>
        <p>
          Unlike weights, a range survives loading a new list. It stays visible
          in its box, so it can't quietly go stale on you.
        </p>

        <h3>Spins</h3>
        <p>
          One spin turns the wheel. Ask for more than one and it skips the
          animation and hands you the whole list of winners at once.
        </p>
        <p>
          Multiple spins draw with replacement — the same name can come up
          twice. That's deliberate, not a bug.
        </p>

        <h3>Settings</h3>
        <p>
          Spin duration runs from instant to ten seconds. Below 0.2s the wheel
          stops animating and just gives you the answer.
        </p>
        <p>
          Sound can be turned off, and so can character effects. A few
          characters have their own colours and visuals when they win; switching
          effects off shows every winner the same plain way.
        </p>

        <h3>What gets saved</h3>
        <p>
          Your list, weights, range, settings and last result are kept in this
          browser. Nothing is sent anywhere and nothing follows you to another
          device. Clearing your browser data clears all of it.
        </p>

        <button onClick={onClose} style={{ width: '100%', marginTop: '1.5rem' }}>Close</button>
      </div>
    </div>
  );
}

export default HelpModal;
