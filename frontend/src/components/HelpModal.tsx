import { STORAGE_KEYS } from '../storage';
import { usePersistedString } from '../usePersistedState';

interface HelpModalProps {
  onClose: () => void;
}

/**
 * How the wheel works, for someone opening it for the first time.
 *
 * Everything here describes behaviour that is decided elsewhere — the parser's
 * rules, how weights are keyed, when the wheel is skipped. If one of those
 * changes, this text is wrong until someone updates it, in both languages.
 *
 * The content is data rather than markup so the two translations stay the same
 * shape: a missing section is then visible as a missing entry, instead of
 * being buried in a wall of duplicated JSX.
 */

type Language = 'en' | 'he';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'he', label: 'עברית' },
];

/**
 * A run of prose, or a literal to set as code.
 *
 * Literals are the exact strings a user types or sees on a button. Marking
 * them also fixes them left-to-right, which matters once they are sitting in
 * the middle of a Hebrew sentence.
 */
type Fragment = string | { code: string };

interface Section {
  heading: string;
  paragraphs: Fragment[][];
}

interface HelpContent {
  title: string;
  intro: Fragment[][];
  sections: Section[];
  close: string;
}

const HELP: Record<Language, HelpContent> = {
  en: {
    title: 'How this works',
    close: 'Close',
    intro: [
      [
        'Paste a link to a Google Doc, or type the names in yourself, and press ',
        { code: 'Load Characters' },
        '. Then spin.',
      ],
    ],
    sections: [
      {
        heading: 'What counts as a character',
        paragraphs: [
          [
            'Only numbered lines. A line has to start with a number, or be an item in a numbered list. Bulleted lists are never characters, and neither is ordinary paragraph text — so headings, notes and rules in the same document are left alone.',
          ],
          [
            'The number is stripped off, so ',
            { code: '7. Sam' },
            ' becomes ',
            { code: 'Sam' },
            ". If there's a colon, everything after it is dropped: ",
            { code: 'Sam (Megabears 1): the tall one' },
            ' is stored as ',
            { code: 'Sam (Megabears 1)' },
            '. The part in brackets stays, which is how two characters with the same name stay apart.',
          ],
          [
            'Names that are themselves numbers survive intact — ',
            { code: '1.5' },
            ' stays ',
            { code: '1.5' },
            ', and ',
            { code: '10-20 Squad' },
            ' keeps its range. Text colour comes across from the document too, which is why some names are coloured in the list. Black text is flipped to white so it stays readable here.',
          ],
          [
            'The document has to be shared as ',
            { code: 'Anyone with the link' },
            " or it can't be read at all.",
          ],
          [
            'You can skip the document entirely and paste or type a plain list instead. Typed in by hand, every non-empty line counts, numbered or not.',
          ],
        ],
      },
      {
        heading: 'Weights',
        paragraphs: [
          [
            'Everyone starts at 1. The number is how many entries someone gets, so a character on 3 is three times as likely as one on 1, and their slice of the wheel is three times as wide.',
          ],
          [
            'Set someone to 0 and they come off the wheel but stay in the list, so you can put them back without reloading. ',
            { code: 'Reset' },
            ' puts everyone back to 1.',
          ],
          [
            "The search box above the list only filters what you're looking at. It doesn't change who is on the wheel.",
          ],
          [
            'Loading a new list also resets every weight to 1. Weights are tied to positions in the document rather than to names, so carrying them over would quietly apply the old tuning to whoever now sits in those slots.',
          ],
          [
            "If everything is on 0 there's nothing to land on, and the winner comes back as ",
            { code: 'VOID' },
            '.',
          ],
        ],
      },
      {
        heading: 'Ranges',
        paragraphs: [
          [
            { code: 'Include Ranges' },
            ' narrows the wheel down without changing the list. ',
            { code: '1-10' },
            ' uses the first ten; ',
            { code: '1-10, 25, 40-50' },
            ' uses three separate chunks. The numbers are the ones shown beside each name. Leave it empty to use everyone.',
          ],
          [
            "Unlike weights, a range survives loading a new list. It stays visible in its box, so it can't quietly go stale on you.",
          ],
        ],
      },
      {
        heading: 'Spins',
        paragraphs: [
          [
            'One spin turns the wheel. Ask for more than one and it skips the animation and hands you the whole list of winners at once.',
          ],
          [
            "Multiple spins draw with replacement — the same name can come up twice. That's deliberate, not a bug.",
          ],
        ],
      },
      {
        heading: 'The last result',
        paragraphs: [
          [
            'The scroll button at the top holds the winners from your most recent spin, with the time it happened. The same thing sits above the wheel as ',
            { code: 'View Last Results' },
            '.',
          ],
          [
            'Despite the icon it is the last spin only, not a running log — each spin replaces what was there. It survives closing the results and reloading the page, so a result is not lost if someone taps away from it. ',
            { code: 'Clear' },
            ' empties it, and the button disappears until you spin again.',
          ],
        ],
      },
      {
        heading: 'Making your own animations',
        paragraphs: [
          [
            'The clapperboard button at the top opens the animation builder. An animation is what happens when one particular character wins: some effects playing together, and how the results look.',
          ],
          [
            'Start by entering a name. It is not a password and does not have to be unique — it only keeps animations apart, so ones saved under jack play for whoever has typed jack. Capital letters do not matter.',
          ],
          [
            'Add effects one at a time. Each has its own settings, with a note explaining every one; ',
            { code: 'Animate' },
            ' shows that effect on its own, and ',
            { code: 'Play' },
            ' shows the whole animation. Choose the character from your loaded list, style the results if you like, then ',
            { code: 'Save' },
            '.',
          ],
          [
            'Timing is shared to begin with: ',
            { code: 'Fade in' },
            ', ',
            { code: 'Hold' },
            ' and ',
            { code: 'Fade out' },
            ' are set once for the whole animation, so every effect comes and goes together. To time each effect on its own, untick ',
            { code: 'Same timing for every effect' },
            '.',
          ],
          [
            'If that character already has an animation — a built-in one, or one of yours — you are asked before it is replaced, and you can watch the old one first. Replacing a built-in animation only changes it for your name; everyone else still sees the original.',
          ],
          [
            'For now animations are kept in this browser, so they do not follow you to another phone. ',
            { code: 'Export' },
            ' gives you a code to keep or send to yourself; ',
            { code: 'Import' },
            ' brings one back.',
          ],
        ],
      },
      {
        heading: 'Settings',
        paragraphs: [
          [
            'Spin duration runs from instant to ten seconds. Below 0.2s the wheel stops animating and just gives you the answer.',
          ],
          [
            'Sound can be turned off, and so can animations. Some characters have their own colours and effects when they win, including any you have made; switching animations off shows every winner the same plain way.',
          ],
        ],
      },
      {
        heading: 'What gets saved',
        paragraphs: [
          [
            'Your list, weights, range, settings, name, animations and last result are kept in this browser. Nothing is sent anywhere and nothing follows you to another device. Clearing your browser data clears all of it — animations included, so export any you want to keep.',
          ],
        ],
      },
    ],
  },

  he: {
    title: 'איך זה עובד',
    close: 'סגירה',
    intro: [
      [
        'הדביקו קישור למסמך Google, או פשוט הקלידו את השמות בעצמכם, ולחצו על ',
        { code: 'Load Characters' },
        '. אחר כך סובבו.',
      ],
    ],
    sections: [
      {
        heading: 'מה נחשב דמות',
        paragraphs: [
          [
            'רק שורות ממוספרות. שורה צריכה להתחיל במספר, או להיות פריט ברשימה ממוספרת. רשימות עם נקודות אף פעם לא נחשבות, וגם לא טקסט רגיל — ככה שכותרות, הערות וחוקים באותו מסמך פשוט לא נכנסים.',
          ],
          [
            'המספר נחתך, אז ',
            { code: '7. Sam' },
            ' הופך ל־',
            { code: 'Sam' },
            '. אם יש נקודתיים, כל מה שאחריהן יורד: ',
            { code: 'Sam (Megabears 1): the tall one' },
            ' נשמר בתור ',
            { code: 'Sam (Megabears 1)' },
            '. מה שבסוגריים נשאר, וככה שתי דמויות עם אותו שם לא מתבלבלות.',
          ],
          [
            'שמות שהם עצמם מספרים נשארים שלמים — ',
            { code: '1.5' },
            ' נשאר ',
            { code: '1.5' },
            ', ו־',
            { code: '10-20 Squad' },
            ' שומר על הטווח שלו. גם צבע הטקסט עובר מהמסמך, ולכן חלק מהשמות צבועים ברשימה. טקסט שחור הופך ללבן כדי שיישאר קריא כאן.',
          ],
          [
            'המסמך חייב להיות משותף בתור ',
            { code: 'Anyone with the link' },
            ', אחרת אי אפשר לקרוא אותו בכלל.',
          ],
          [
            'אפשר גם לוותר על המסמך לגמרי ולהדביק או להקליד רשימה רגילה. כשמקלידים ידנית, כל שורה שאינה ריקה נחשבת, ממוספרת או לא.',
          ],
        ],
      },
      {
        heading: 'משקלים',
        paragraphs: [
          [
            'כולם מתחילים ב־1. המספר הוא כמה כניסות יש לדמות, אז דמות עם 3 היא בעלת סיכוי גדול פי שלושה מדמות עם 1, והפרוסה שלה בגלגל רחבה פי שלושה.',
          ],
          [
            'מי שמוגדר 0 יורד מהגלגל אבל נשאר ברשימה, אז אפשר להחזיר אותו בלי לטעון מחדש. ',
            { code: 'Reset' },
            ' מחזיר את כולם ל־1.',
          ],
          [
            'תיבת החיפוש שמעל הרשימה מסננת רק את מה שרואים. היא לא משנה מי נמצא על הגלגל.',
          ],
          [
            'טעינה של רשימה חדשה גם מאפסת את כל המשקלים ל־1. המשקלים קשורים למיקומים במסמך ולא לשמות, אז שמירה עליהם הייתה מחילה בשקט את הכיוונון הישן על מי שיושב עכשיו במקומות האלה.',
          ],
          [
            'אם כולם על 0 אין על מה לנחות, והזוכה חוזר בתור ',
            { code: 'VOID' },
            '.',
          ],
        ],
      },
      {
        heading: 'טווחים',
        paragraphs: [
          [
            { code: 'Include Ranges' },
            ' מצמצם את הגלגל בלי לשנות את הרשימה. ',
            { code: '1-10' },
            ' לוקח את העשרה הראשונים; ',
            { code: '1-10, 25, 40-50' },
            ' לוקח שלושה חלקים נפרדים. המספרים הם אלה שמופיעים ליד כל שם. אם משאירים ריק, כולם נכנסים.',
          ],
          [
            'בניגוד למשקלים, טווח שורד טעינה של רשימה חדשה. הוא נשאר גלוי בתיבה שלו, ככה שהוא לא מתיישן בלי ששמים לב.',
          ],
        ],
      },
      {
        heading: 'סיבובים',
        paragraphs: [
          [
            'סיבוב אחד מסובב את הגלגל. אם מבקשים יותר מאחד, האנימציה מדולגת ומקבלים את כל הזוכים בבת אחת.',
          ],
          [
            'כמה סיבובים מגרילים עם החזרה — אותו שם יכול לצאת פעמיים. זה בכוונה, לא באג.',
          ],
        ],
      },
      {
        heading: 'התוצאה האחרונה',
        paragraphs: [
          [
            'כפתור המגילה שלמעלה שומר את הזוכים מהסיבוב האחרון, יחד עם השעה. אותו דבר מופיע גם מעל הגלגל בתור ',
            { code: 'View Last Results' },
            '.',
          ],
          [
            'למרות האייקון זו רק התוצאה האחרונה ולא יומן — כל סיבוב מחליף את מה שהיה. היא שורדת סגירה של חלון התוצאות וגם רענון של הדף, אז תוצאה לא הולכת לאיבוד אם יוצאים ממנה בטעות. ',
            { code: 'Clear' },
            ' מרוקן אותה, והכפתור נעלם עד הסיבוב הבא.',
          ],
        ],
      },
      {
        heading: 'יצירת אנימציות משלכם',
        paragraphs: [
          [
            'כפתור הקלאפר שלמעלה פותח את בונה האנימציות. אנימציה היא מה שקורה כשדמות מסוימת זוכה: כמה אפקטים שמתנגנים יחד, ואיך נראות התוצאות.',
          ],
          [
            'מתחילים בהקלדת שם. זו לא סיסמה והשם לא חייב להיות ייחודי — הוא רק מפריד בין אנימציות, כך שאנימציות שנשמרו תחת jack יופיעו אצל כל מי שהקליד jack. אותיות גדולות וקטנות לא משנות.',
          ],
          [
            'מוסיפים אפקטים אחד אחד. לכל אחד יש הגדרות משלו, עם הסבר לכל הגדרה; ',
            { code: 'Animate' },
            ' מראה את האפקט לבד, ו־',
            { code: 'Play' },
            ' מראה את כל האנימציה. בוחרים את הדמות מהרשימה שנטענה, מעצבים את התוצאות אם רוצים, ולוחצים ',
            { code: 'Save' },
            '.',
          ],
          [
            'התזמון משותף כברירת מחדל: את ',
            { code: 'Fade in' },
            ', ',
            { code: 'Hold' },
            ' ו־',
            { code: 'Fade out' },
            ' קובעים פעם אחת לכל האנימציה, כך שכל האפקטים מופיעים ונעלמים יחד. כדי לתזמן כל אפקט בנפרד, מבטלים את הסימון של ',
            { code: 'Same timing for every effect' },
            '.',
          ],
          [
            'אם לדמות כבר יש אנימציה — מובנית או אחת שלכם — תישאלו לפני שהיא מוחלפת, ואפשר לצפות בישנה קודם. החלפה של אנימציה מובנית משנה אותה רק עבור השם שלכם; כל השאר עדיין רואים את המקורית.',
          ],
          [
            'בינתיים האנימציות נשמרות בדפדפן הזה, כך שהן לא עוברות איתכם לטלפון אחר. ',
            { code: 'Export' },
            ' נותן קוד לשמירה או לשליחה לעצמכם; ',
            { code: 'Import' },
            ' מחזיר אותו.',
          ],
        ],
      },
      {
        heading: 'הגדרות',
        paragraphs: [
          [
            'משך הסיבוב נע בין מיידי לעשר שניות. מתחת ל־0.2 שניות הגלגל מפסיק להסתובב ופשוט נותן את התשובה.',
          ],
          [
            'אפשר לכבות את הצליל, ואפשר לכבות גם את האנימציות. לחלק מהדמויות יש צבעים ואפקטים משלהן כשהן זוכות, כולל אלה שיצרתם; כיבוי האנימציות מציג את כל הזוכים באותה צורה פשוטה.',
          ],
        ],
      },
      {
        heading: 'מה נשמר',
        paragraphs: [
          [
            'הרשימה, המשקלים, הטווח, ההגדרות, השם, האנימציות והתוצאה האחרונה נשמרים בדפדפן הזה. שום דבר לא נשלח לשום מקום ולא עובר איתכם למכשיר אחר. ניקוי נתוני הדפדפן מוחק את הכול — כולל האנימציות, אז כדאי לייצא את אלה שרוצים לשמור.',
          ],
        ],
      },
    ],
  },
};

function isLanguage(value: string): value is Language {
  return value === 'en' || value === 'he';
}

function renderParagraph(fragments: Fragment[]) {
  return fragments.map((fragment, i) =>
    typeof fragment === 'string'
      ? fragment
      : <code key={i}>{fragment.code}</code>,
  );
}

function HelpModal({ onClose }: HelpModalProps) {
  const [stored, setStored] = usePersistedString(STORAGE_KEYS.helpLanguage, 'en');
  // A value from a future version, or an edited one, must not blank the panel.
  const language: Language = isLanguage(stored) ? stored : 'en';
  const content = HELP[language];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="settings-modal help-modal"
        // Hebrew flips the whole panel, close button included, rather than
        // leaving right-to-left prose in a left-to-right frame.
        dir={language === 'he' ? 'rtl' : 'ltr'}
        onClick={e => e.stopPropagation()}
      >
        <div className="help-header">
          <h2 style={{ margin: 0 }}>{content.title}</h2>
          <div className="help-lang">
            {LANGUAGES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === language ? 'is-selected' : ''}
                onClick={() => setStored(option.id)}
                lang={option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            className="help-close"
            onClick={onClose}
            aria-label={content.close}
          >
            ✕
          </button>
        </div>

        {content.intro.map((paragraph, i) => (
          <p key={i}>{renderParagraph(paragraph)}</p>
        ))}

        {content.sections.map((section) => (
          <section key={section.heading}>
            <h3>{section.heading}</h3>
            {section.paragraphs.map((paragraph, i) => (
              <p key={i}>{renderParagraph(paragraph)}</p>
            ))}
          </section>
        ))}

        <button onClick={onClose} style={{ width: '100%', marginTop: '1.5rem' }}>
          {content.close}
        </button>
      </div>
    </div>
  );
}

export default HelpModal;
