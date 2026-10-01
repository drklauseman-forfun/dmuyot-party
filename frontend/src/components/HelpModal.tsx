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
            'Unlike weights, a range survives loading a new list — and closing the app. If the wheel has fewer characters than you expect, look in this box first: a number left in it from last time is the usual reason.',
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
            "Multiple spins draw with replacement — the same name can come up twice. That's deliberate, not a bug. Knockout mode is the exception; see below.",
          ],
        ],
      },
      {
        heading: 'Knockout',
        paragraphs: [
          [
            'Tick ',
            { code: '🥊 Knockout' },
            ' beside the spin button and every winner is out: they drop off the wheel and are marked out in the list until you press ',
            { code: 'Restart' },
            '. Spinning several times at once picks that many different characters; if fewer are left, you get the ones that are.',
          ],
          [
            'Once everyone has been picked, the spin button turns into ',
            { code: 'Restart' },
            ', which brings them all back for a new round. Loading a list, or switching knockout off, brings everyone back too.',
          ],
          [
            'Neither knockout nor who is out is saved. Refresh the page or close the app and it opens in the normal mode with everyone in — so a round left unfinished never costs anyone their turn later.',
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
            'Start by entering a name. Your animations are kept under it, so typing the same name on another phone brings them there too. Capital letters do not matter.',
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
            'Animations are kept on the server, under your name. Ones already on a phone are uploaded the first time the app opens there, and changes made on one phone reach the others the next time the app opens on them.',
          ],
          [
            'The first time you save, delete or import under a name, the builder asks you to choose a PIN for it. From then on, changing the animations under that name needs the PIN, on any phone; playing them never does. A phone remembers the PIN once it has worked. If the server cannot be reached, changes are saved on the phone and shared the next time it can be.',
          ],
          [
            { code: 'Export' },
            ' still gives you a code to keep or send to someone; ',
            { code: 'Import' },
            ' brings one back.',
          ],
        ],
      },
      {
        heading: 'The effects',
        paragraphs: [
          [
            'Most effects draw one thing, with a ',
            { code: 'Kind' },
            ' or ',
            { code: 'Style' },
            ' to choose which: one clock, one weapon, one hand reaching in. To fill the screen, add the same effect several times with different kinds, places and sizes — that is how the built-in animation with a wall of clocks is made.',
          ],
          [
            { code: 'Words' },
            ' writes your own words around the screen, in any language. ',
            { code: 'Memes' },
            ' plays GIFs from Giphy: it starts with a set of well-known memes, and you can add any other by pasting its giphy.com link. Memes need an internet connection, can pop in a moment late on slow data, and an iPhone in Low Power Mode may not play them.',
          ],
          [
            'Effects that scatter things about — words, memes, eyes — keep clear of the middle, where the winner\'s name is. ',
            { code: 'Curtain' },
            ' can hang over the results box itself, fitted to it on any screen, or across the whole screen.',
          ],
          [
            'Effects made of light glow and brighten the screen, so a dark colour barely shows in them. Where an effect has a ',
            { code: 'Blend' },
            ' setting, ',
            { code: 'Paint over' },
            ' is how to make it dark.',
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
          [
            'Previews in the animation builder always play, even with animations switched off. So if an animation plays in the builder but not after a spin, check that animations are on here.',
          ],
        ],
      },
      {
        heading: 'What gets saved',
        paragraphs: [
          [
            'Your list, weights, range, settings, name and last result are kept in this browser, and clearing your browser data clears them. Animations are kept on the server too, under your name, so they survive that: type the name again and they come back. Knockout mode and who is out are not saved at all.',
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
            'בניגוד למשקלים, טווח שורד טעינה של רשימה חדשה — וגם סגירה של האפליקציה. אם בגלגל יש פחות דמויות ממה שציפיתם, הסתכלו קודם בתיבה הזו: מספר שנשאר בה מפעם קודמת הוא הסיבה הרגילה.',
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
            'כמה סיבובים מגרילים עם החזרה — אותו שם יכול לצאת פעמיים. זה בכוונה, לא באג. מצב נוקאאוט הוא היוצא מן הכלל; ראו בהמשך.',
          ],
        ],
      },
      {
        heading: 'נוקאאוט',
        paragraphs: [
          [
            'סמנו ',
            { code: '🥊 Knockout' },
            ' ליד כפתור הסיבוב, וכל מי שנבחר יוצא: הוא יורד מהגלגל ומסומן כיוצא ברשימה עד שלוחצים ',
            { code: 'Restart' },
            '. סיבוב של כמה פעמים בבת אחת בוחר דמויות שונות זו מזו; אם נשארו פחות, מקבלים את אלה שנשארו.',
          ],
          [
            'כשכולם כבר נבחרו, כפתור הסיבוב הופך ל־',
            { code: 'Restart' },
            ', שמחזיר את כולם לסבב חדש. טעינת רשימה, או כיבוי הנוקאאוט, מחזירים את כולם גם הם.',
          ],
          [
            'לא מצב הנוקאאוט ולא מי שיצא נשמרים. רענון הדף או סגירת האפליקציה פותחים אותה במצב הרגיל עם כולם בפנים — כך שסבב שלא הסתיים אף פעם לא יגרום למישהו לפספס את התור שלו בהמשך.',
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
            'מתחילים בהקלדת שם. האנימציות שלכם נשמרות תחתיו, כך שהקלדת אותו שם בטלפון אחר מביאה אותן גם לשם. אותיות גדולות וקטנות לא משנות.',
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
            'האנימציות נשמרות בשרת, תחת השם שלכם. אנימציות שכבר נמצאות בטלפון עולות לשרת בפעם הראשונה שהאפליקציה נפתחת בו, ושינויים שנעשו בטלפון אחד מגיעים לאחרים בפעם הבאה שהאפליקציה נפתחת בהם.',
          ],
          [
            'בפעם הראשונה ששומרים, מוחקים או מייבאים תחת שם, הבונה מבקש לבחור לו קוד PIN. מאז, כדי לשנות את האנימציות של השם הזה צריך את ה־PIN, בכל טלפון; כדי שיתנגנו לא צריך אותו אף פעם. טלפון זוכר את ה־PIN אחרי שהוא עבד פעם אחת. אם אי אפשר להגיע לשרת, השינויים נשמרים בטלפון ומשותפים בפעם הבאה שאפשר.',
          ],
          [
            { code: 'Export' },
            ' עדיין נותן קוד לשמירה או לשליחה למישהו; ',
            { code: 'Import' },
            ' מחזיר אותו.',
          ],
        ],
      },
      {
        heading: 'האפקטים',
        paragraphs: [
          [
            'רוב האפקטים מציירים דבר אחד, עם ',
            { code: 'Kind' },
            ' או ',
            { code: 'Style' },
            ' שבוחר מה: שעון אחד, כלי נשק אחד, יד אחת שנכנסת. כדי למלא את המסך, מוסיפים את אותו אפקט כמה פעמים עם סוגים, מקומות וגדלים שונים — ככה בנויה האנימציה המובנית עם הקיר של השעונים.',
          ],
          [
            { code: 'Words' },
            ' כותב מילים משלכם מסביב למסך, בכל שפה. ',
            { code: 'Memes' },
            ' מנגן קובצי GIF מ־Giphy: הוא מתחיל עם סט של ממים מוכרים, ואפשר להוסיף כל אחד אחר על ידי הדבקת הקישור שלו מ־giphy.com. ממים צריכים חיבור לאינטרנט, יכולים להופיע רגע באיחור בגלישה איטית, ואייפון במצב חיסכון בסוללה עלול לא לנגן אותם.',
          ],
          [
            'אפקטים שמפזרים דברים — מילים, ממים, עיניים — שומרים מרחק מהאמצע, איפה שהשם של הזוכה. ',
            { code: 'Curtain' },
            ' יכול להיתלות מעל חלון התוצאות עצמו, מותאם אליו בכל מסך, או לרוחב כל המסך.',
          ],
          [
            'אפקטים שעשויים מאור זוהרים ומבהירים את המסך, כך שצבע כהה כמעט לא נראה בהם. באפקטים שיש להם הגדרת ',
            { code: 'Blend' },
            ', ',
            { code: 'Paint over' },
            ' היא הדרך לצבוע בכהה.',
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
          [
            'תצוגות מקדימות בבונה האנימציות תמיד מתנגנות, גם כשהאנימציות כבויות. אז אם אנימציה מתנגנת בבונה אבל לא אחרי סיבוב, בדקו כאן שהאנימציות מופעלות.',
          ],
        ],
      },
      {
        heading: 'מה נשמר',
        paragraphs: [
          [
            'הרשימה, המשקלים, הטווח, ההגדרות, השם והתוצאה האחרונה נשמרים בדפדפן הזה, וניקוי נתוני הדפדפן מוחק אותם. האנימציות נשמרות גם בשרת, תחת השם שלכם, כך שהן שורדות את זה: מקלידים שוב את השם והן חוזרות. מצב הנוקאאוט ומי שיצא לא נשמרים בכלל.',
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
