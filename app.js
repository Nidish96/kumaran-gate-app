/* Gate Approvals: resident app. Talks to the Apps Script backend (window.GATE_API) and gets
   notifications through Firebase Cloud Messaging. */
(function () {
  'use strict';

  var API = window.GATE_API;
  var app = document.getElementById('app');
  var cfg = null, messaging = null, swReg = null, timer = null, highlight = null, busy = false;
  var seenIds = null; // visitor requests already shown; a new one plays the chime
  var passDefault = 30;
  var PASS_CHOICES = [['15', 'p15'], ['30', 'p30'], ['60', 'p60'], ['180', 'p180'], ['m', 'pMid']];

  /* -------------------------------------------------------------- languages */
  var LANG_NAMES = { en: 'English', ta: 'தமிழ்', hi: 'हिंदी' };
  var LOCALES = { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN' };
  var PURPOSES = {
    'Guest': { ta: 'விருந்தினர்', hi: 'मेहमान' },
    'Delivery': { ta: 'டெலிவரி', hi: 'डिलीवरी' },
    'Service / repair': { ta: 'சர்வீஸ் / பழுதுபார்ப்பு', hi: 'सर्विस / मरम्मत' },
    'Cab / driver': { ta: 'கேப் / டிரைவர்', hi: 'कैब / ड्राइवर' }
  };
  var T = {
    en: {
      p15: '15 min', p30: '30 min', p60: '1 hour', p180: '3 hours', pMid: 'Until midnight',
      today: 'Today', yesterday: 'Yesterday', justNow: 'just now', min1: '1 min ago', minN: '{n} min ago', hN: '{n} h ago',
      wrong: 'Something went wrong.', setup: 'Setup needed', setupBody: 'Open <b>config.js</b> and paste your web app URL.',
      noConn: 'No connection', noConnBody: 'Check your internet connection and open the app again.', tryAgain: 'Try again',
      gateApprovals: 'Gate approvals', installFirst: 'Install the app first',
      iosNote: 'On iPhone, notifications only work once the app is on your Home Screen.',
      ios1: 'Tap the <b>Share</b> button (the square with an arrow) at the bottom of Safari.',
      ios2: 'Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.', ios3: 'Open <b>Gate</b> from your Home Screen.',
      ios4: 'Enter your flat and code from your slip:', iosTiny: 'Needs iOS 16.4 or newer. Use Safari, not Chrome, to add it.',
      flatCode: 'Flat {f} · {c}', joinFlat: 'Join your flat',
      joinNote: 'You will get a notification when a visitor comes for your flat, with their photo and Approve / Deny buttons.',
      flat: 'Flat', flatPh: 'e.g. 4B', code: 'Code (on your slip)', codePh: '6 letters/numbers', yourName: 'Your name',
      namePh: 'Shown to others in your flat', joinBtn: 'Join and turn on notifications',
      joinTiny: 'Your name is stored by your residents\' association with the visitor register. No phone number is needed.',
      eFlat: 'Please enter your flat.', eCode: 'Please enter the 6-character code from your slip.', eName: 'Please enter your name.',
      joining: 'Joining…', joined: 'Joined Flat {f}', flatN: 'Flat {f}', loading: 'Loading…', recent: 'Recent visitors',
      leaveBtn: 'Leave Flat {f} on this phone', updated: 'Updated {t}', offline: 'Offline. Retrying…',
      noneWaiting: 'No visitors waiting right now.', atGate: 'Visitor at the gate', photoNA: 'Photo not available.',
      purpose: 'Purpose', voiceNote: 'Voice note', waitingSince: 'Waiting since {t} ({a})', validFor: 'If approved, pass valid for',
      deny: '✖ Deny', approve: '✓ Approve', APPROVED: '✓ Approved', DENIED: '✖ Denied', EXPIRED: 'No answer',
      until: 'until {t}', ended: 'ended {t}', noVisitors: 'No visitors yet.', alreadyExpired: 'This request had already expired.',
      alreadyA: 'Already approved by {by}', alreadyD: 'Already denied by {by}',
      approvedT: 'Approved until {t}. The visitor\'s screen is now green.', deniedT: 'Denied. The visitor has been told.',
      toneIOS: 'iPhones use the standard notification sound for web apps; it can\'t be changed. Make sure <b>Settings → Notifications → Gate</b> has <b>Sounds</b> and <b>Banners</b> turned on, and that Focus or Silent mode isn\'t muting it.',
      tone1: 'Tap <b>Send a test</b> above, or wait for a gate notification.',
      tone2: '<b>Long-press</b> the notification when it appears, then tap the <b>gear</b> or <b>Settings</b>.',
      tone3: 'Tap <b>Sound</b> and pick a tone you\'ll recognise. Only gate notifications use it.',
      alerts: 'Alerts', chimeLbl: 'Chime and vibrate when a visitor arrives while the app is open', hear: 'Hear it',
      setTone: 'Set a notification tone', nNA: 'Notifications are not available here.',
      nNAios: 'Open Gate from your Home Screen (iOS 16.4 or newer).', nNAother: 'Open this app in Chrome.',
      nNAuntil: 'Until then, check this screen for visitors.',
      nBlocked: '<b>Notifications are blocked.</b> Allow them for this app in your phone\'s settings, then reopen it.',
      nOff: '<b>Turn on notifications</b> so you know when a visitor arrives.', nOffBtn: 'Turn on notifications',
      nOn: '🔔 Notifications are on', sendTest: 'Send a test', testSent: 'Test sent. It should arrive in a few seconds.',
      leaveQ: 'Stop getting visitor requests for Flat {f} on this phone?', left: 'You have left. Scan your slip again to rejoin.',
      language: 'Language',
      e_tooManyCodes: 'Too many wrong codes for this flat. Try again in an hour.',
      e_codeMismatch: 'That flat and code don\'t match. Check the slip for your flat.',
      e_errName: 'Please enter your name.',
      e_flatFull: 'Flat {f} already has {n} phones registered, which is the limit. Remove one from its app (Leave this flat), or ask the association.',
      e_notYourFlat: 'This visitor request is not for your flat.',
      e_gone: 'This phone is no longer registered. Join your flat again using its slip.',
      e_notifNotOn: 'Notifications are not turned on for this phone yet.',
      e_testFailed: 'Could not send a notification to this phone. Turn notifications off and on again in the app.',
      e_generic: 'Something went wrong.'
    },
    ta: {
      p15: '15 நிமி', p30: '30 நிமி', p60: '1 மணி நேரம்', p180: '3 மணி நேரம்', pMid: 'நள்ளிரவு வரை',
      today: 'இன்று', yesterday: 'நேற்று', justNow: 'இப்போது', min1: '1 நிமி முன்', minN: '{n} நிமி முன்', hN: '{n} மணி முன்',
      wrong: 'ஏதோ தவறு நடந்தது.', setup: 'அமைப்பு தேவை', setupBody: '<b>config.js</b>-ஐத் திறந்து உங்கள் web app URL-ஐ ஒட்டவும்.',
      noConn: 'இணைப்பு இல்லை', noConnBody: 'இணைய இணைப்பைச் சரிபார்த்து, செயலியை மீண்டும் திறக்கவும்.', tryAgain: 'மீண்டும் முயற்சி',
      gateApprovals: 'கேட் அனுமதிகள்', installFirst: 'முதலில் செயலியை நிறுவுங்கள்',
      iosNote: 'iPhone-இல், செயலி முகப்புத் திரையில் இருந்தால் மட்டுமே அறிவிப்புகள் வேலை செய்யும்.',
      ios1: 'Safari-இன் கீழே உள்ள <b>Share</b> பொத்தானைத் (அம்புக்குறியுடன் கூடிய சதுரம்) தட்டவும்.',
      ios2: 'கீழே உருட்டி <b>Add to Home Screen</b>, பிறகு <b>Add</b> என்பதைத் தட்டவும்.', ios3: 'முகப்புத் திரையிலிருந்து <b>Gate</b>-ஐத் திறக்கவும்.',
      ios4: 'உங்கள் சீட்டில் உள்ள ஃபிளாட் மற்றும் குறியீட்டை உள்ளிடவும்:', iosTiny: 'iOS 16.4 அல்லது புதியது தேவை. சேர்க்க Chrome அல்ல, Safari பயன்படுத்தவும்.',
      flatCode: 'ஃபிளாட் {f} · {c}', joinFlat: 'உங்கள் ஃபிளாட்டில் இணையுங்கள்',
      joinNote: 'உங்கள் ஃபிளாட்டுக்குப் பார்வையாளர் வரும்போது, அவரது புகைப்படம் மற்றும் அனுமதி / மறு பொத்தான்களுடன் அறிவிப்பு வரும்.',
      flat: 'ஃபிளாட்', flatPh: 'எ.கா. 4B', code: 'குறியீடு (சீட்டில் உள்ளது)', codePh: '6 எழுத்துகள்/எண்கள்', yourName: 'உங்கள் பெயர்',
      namePh: 'உங்கள் ஃபிளாட்டில் உள்ளவர்களுக்குக் காட்டப்படும்', joinBtn: 'இணைந்து அறிவிப்புகளை இயக்கு',
      joinTiny: 'உங்கள் பெயர் பார்வையாளர் பதிவேட்டுடன் குடியிருப்போர் சங்கத்தால் சேமிக்கப்படும். போன் எண் தேவையில்லை.',
      eFlat: 'உங்கள் ஃபிளாட்டை உள்ளிடவும்.', eCode: 'சீட்டில் உள்ள 6 எழுத்துக் குறியீட்டை உள்ளிடவும்.', eName: 'உங்கள் பெயரை உள்ளிடவும்.',
      joining: 'இணைகிறது…', joined: 'ஃபிளாட் {f}-இல் இணைந்தீர்கள்', flatN: 'ஃபிளாட் {f}', loading: 'ஏற்றுகிறது…', recent: 'சமீபத்திய பார்வையாளர்கள்',
      leaveBtn: 'இந்த போனில் ஃபிளாட் {f}-இலிருந்து விலகு', updated: '{t}-க்குப் புதுப்பிக்கப்பட்டது', offline: 'இணைப்பு இல்லை. மீண்டும் முயற்சிக்கிறது…',
      noneWaiting: 'இப்போது எந்தப் பார்வையாளரும் காத்திருக்கவில்லை.', atGate: 'வாசலில் பார்வையாளர்', photoNA: 'புகைப்படம் கிடைக்கவில்லை.',
      purpose: 'நோக்கம்', voiceNote: 'குரல் பதிவு', waitingSince: '{t} முதல் காத்திருக்கிறார் ({a})', validFor: 'அனுமதித்தால், சீட்டு செல்லும் நேரம்',
      deny: '✖ மறு', approve: '✓ அனுமதி', APPROVED: '✓ அனுமதிக்கப்பட்டது', DENIED: '✖ மறுக்கப்பட்டது', EXPIRED: 'பதில் இல்லை',
      until: '{t} வரை', ended: '{t}-க்கு முடிந்தது', noVisitors: 'இன்னும் பார்வையாளர்கள் இல்லை.', alreadyExpired: 'இந்தக் கோரிக்கை ஏற்கனவே காலாவதியானது.',
      alreadyA: '{by} ஏற்கனவே அனுமதித்துவிட்டார்', alreadyD: '{by} ஏற்கனவே மறுத்துவிட்டார்',
      approvedT: '{t} வரை அனுமதிக்கப்பட்டது. பார்வையாளரின் திரை இப்போது பச்சை.', deniedT: 'மறுக்கப்பட்டது. பார்வையாளருக்குத் தெரிவிக்கப்பட்டது.',
      toneIOS: 'iPhone-இல் வலைச் செயலிகளுக்கு வழக்கமான அறிவிப்பு ஒலியே இருக்கும்; அதை மாற்ற முடியாது. <b>Settings → Notifications → Gate</b>-இல் <b>Sounds</b>, <b>Banners</b> இயக்கத்தில் உள்ளதையும், Focus அல்லது Silent mode ஒலியை நிறுத்தவில்லை என்பதையும் உறுதிசெய்யவும்.',
      tone1: 'மேலே உள்ள <b>சோதனை அனுப்பு</b>-ஐத் தட்டவும், அல்லது கேட் அறிவிப்புக்குக் காத்திருக்கவும்.',
      tone2: 'அறிவிப்பு வந்ததும் அதை <b>நீண்ட நேரம் அழுத்தி</b>, <b>கியர்</b> அல்லது <b>Settings</b>-ஐத் தட்டவும்.',
      tone3: '<b>Sound</b>-ஐத் தட்டி, அடையாளம் காணக்கூடிய ஒலியைத் தேர்ந்தெடுக்கவும். கேட் அறிவிப்புகளுக்கு மட்டுமே அது பயன்படும்.',
      alerts: 'எச்சரிக்கைகள்', chimeLbl: 'செயலி திறந்திருக்கும்போது பார்வையாளர் வந்தால் ஒலி எழுப்பி அதிர்வு செய்', hear: 'கேளுங்கள்',
      setTone: 'அறிவிப்பு ஒலியை அமைக்க', nNA: 'இங்கே அறிவிப்புகள் கிடைக்காது.',
      nNAios: 'முகப்புத் திரையிலிருந்து Gate-ஐத் திறக்கவும் (iOS 16.4 அல்லது புதியது).', nNAother: 'இந்தச் செயலியை Chrome-இல் திறக்கவும்.',
      nNAuntil: 'அதுவரை, பார்வையாளர்களுக்கு இந்தத் திரையைப் பார்க்கவும்.',
      nBlocked: '<b>அறிவிப்புகள் தடுக்கப்பட்டுள்ளன.</b> போன் அமைப்புகளில் இந்தச் செயலிக்கு அனுமதி தந்து, மீண்டும் திறக்கவும்.',
      nOff: 'பார்வையாளர் வருவதை அறிய <b>அறிவிப்புகளை இயக்கவும்</b>.', nOffBtn: 'அறிவிப்புகளை இயக்கு',
      nOn: '🔔 அறிவிப்புகள் இயக்கத்தில் உள்ளன', sendTest: 'சோதனை அனுப்பு', testSent: 'சோதனை அனுப்பப்பட்டது. சில வினாடிகளில் வரும்.',
      leaveQ: 'இந்த போனில் ஃபிளாட் {f}-க்கான பார்வையாளர் கோரிக்கைகளை நிறுத்தவா?', left: 'நீங்கள் விலகிவிட்டீர்கள். மீண்டும் இணைய உங்கள் சீட்டை ஸ்கேன் செய்யவும்.',
      language: 'மொழி',
      e_tooManyCodes: 'இந்த ஃபிளாட்டுக்கு அதிகமான தவறான குறியீடுகள். ஒரு மணி நேரம் கழித்து முயற்சிக்கவும்.',
      e_codeMismatch: 'ஃபிளாட்டும் குறியீடும் பொருந்தவில்லை. உங்கள் ஃபிளாட்டின் சீட்டைச் சரிபார்க்கவும்.',
      e_errName: 'உங்கள் பெயரை உள்ளிடவும்.',
      e_flatFull: 'ஃபிளாட் {f}-இல் ஏற்கனவே {n} போன்கள் பதிவாகியுள்ளன, இதுவே வரம்பு. ஒன்றை அதன் செயலியில் நீக்கவும் (இந்த ஃபிளாட்டிலிருந்து விலகு), அல்லது சங்கத்திடம் கேட்கவும்.',
      e_notYourFlat: 'இந்தப் பார்வையாளர் கோரிக்கை உங்கள் ஃபிளாட்டுக்கானது அல்ல.',
      e_gone: 'இந்த போன் இனி பதிவில் இல்லை. உங்கள் சீட்டைப் பயன்படுத்தி மீண்டும் இணையவும்.',
      e_notifNotOn: 'இந்த போனில் இன்னும் அறிவிப்புகள் இயக்கப்படவில்லை.',
      e_testFailed: 'இந்த போனுக்கு அறிவிப்பை அனுப்ப முடியவில்லை. செயலியில் அறிவிப்புகளை அணைத்து மீண்டும் இயக்கவும்.',
      e_generic: 'ஏதோ தவறு நடந்தது.'
    },
    hi: {
      p15: '15 मिनट', p30: '30 मिनट', p60: '1 घंटा', p180: '3 घंटे', pMid: 'आधी रात तक',
      today: 'आज', yesterday: 'कल', justNow: 'अभी', min1: '1 मिनट पहले', minN: '{n} मिनट पहले', hN: '{n} घंटे पहले',
      wrong: 'कुछ गड़बड़ हो गई।', setup: 'सेटअप ज़रूरी है', setupBody: '<b>config.js</b> खोलें और अपना web app URL पेस्ट करें।',
      noConn: 'कनेक्शन नहीं है', noConnBody: 'अपना इंटरनेट कनेक्शन जांचें और ऐप फिर से खोलें।', tryAgain: 'फिर कोशिश करें',
      gateApprovals: 'गेट अनुमतियां', installFirst: 'पहले ऐप इंस्टॉल करें',
      iosNote: 'iPhone पर, सूचनाएं तभी काम करती हैं जब ऐप होम स्क्रीन पर हो।',
      ios1: 'Safari में नीचे <b>Share</b> बटन (तीर वाला चौकोर) पर टैप करें।',
      ios2: 'नीचे स्क्रॉल करें और <b>Add to Home Screen</b>, फिर <b>Add</b> पर टैप करें।', ios3: 'होम स्क्रीन से <b>Gate</b> खोलें।',
      ios4: 'अपनी पर्ची से फ्लैट और कोड लिखें:', iosTiny: 'iOS 16.4 या नया चाहिए। जोड़ने के लिए Chrome नहीं, Safari इस्तेमाल करें।',
      flatCode: 'फ्लैट {f} · {c}', joinFlat: 'अपने फ्लैट से जुड़ें',
      joinNote: 'जब आपके फ्लैट के लिए कोई आगंतुक आएगा, तो आपको उसकी फ़ोटो और अनुमति दें / मना करें बटन के साथ सूचना मिलेगी।',
      flat: 'फ्लैट', flatPh: 'जैसे 4B', code: 'कोड (आपकी पर्ची पर)', codePh: '6 अक्षर/अंक', yourName: 'आपका नाम',
      namePh: 'आपके फ्लैट के अन्य लोगों को दिखेगा', joinBtn: 'जुड़ें और सूचनाएं चालू करें',
      joinTiny: 'आपका नाम आगंतुक रजिस्टर के साथ निवासी संघ के पास रहता है। फ़ोन नंबर की ज़रूरत नहीं।',
      eFlat: 'कृपया अपना फ्लैट लिखें।', eCode: 'कृपया अपनी पर्ची का 6 अक्षरों वाला कोड लिखें।', eName: 'कृपया अपना नाम लिखें।',
      joining: 'जुड़ रहे हैं…', joined: 'फ्लैट {f} से जुड़ गए', flatN: 'फ्लैट {f}', loading: 'लोड हो रहा है…', recent: 'हाल के आगंतुक',
      leaveBtn: 'इस फ़ोन पर फ्लैट {f} छोड़ें', updated: '{t} पर अपडेट हुआ', offline: 'ऑफ़लाइन। फिर से कोशिश…',
      noneWaiting: 'अभी कोई आगंतुक प्रतीक्षा में नहीं है।', atGate: 'गेट पर आगंतुक', photoNA: 'फ़ोटो उपलब्ध नहीं।',
      purpose: 'उद्देश्य', voiceNote: 'वॉइस नोट', waitingSince: '{t} से प्रतीक्षा में ({a})', validFor: 'अनुमति देने पर पास कितनी देर मान्य रहे',
      deny: '✖ मना करें', approve: '✓ अनुमति दें', APPROVED: '✓ अनुमति दी', DENIED: '✖ मना किया', EXPIRED: 'कोई जवाब नहीं',
      until: '{t} तक', ended: '{t} पर समाप्त', noVisitors: 'अभी तक कोई आगंतुक नहीं।', alreadyExpired: 'यह अनुरोध पहले ही समाप्त हो चुका था।',
      alreadyA: '{by} पहले ही अनुमति दे चुके हैं', alreadyD: '{by} पहले ही मना कर चुके हैं',
      approvedT: '{t} तक अनुमति दी गई। आगंतुक की स्क्रीन अब हरी है।', deniedT: 'मना कर दिया। आगंतुक को बता दिया गया है।',
      toneIOS: 'iPhone पर वेब ऐप्स के लिए सामान्य सूचना ध्वनि ही होती है; इसे बदला नहीं जा सकता। देखें कि <b>Settings → Notifications → Gate</b> में <b>Sounds</b> और <b>Banners</b> चालू हैं, और Focus या Silent mode इसे बंद नहीं कर रहा।',
      tone1: 'ऊपर <b>टेस्ट भेजें</b> पर टैप करें, या गेट सूचना की प्रतीक्षा करें।',
      tone2: 'सूचना आने पर उसे <b>देर तक दबाएं</b>, फिर <b>गियर</b> या <b>Settings</b> पर टैप करें।',
      tone3: '<b>Sound</b> पर टैप करें और पहचानने लायक धुन चुनें। यह केवल गेट सूचनाओं के लिए होगी।',
      alerts: 'अलर्ट', chimeLbl: 'ऐप खुला होने पर आगंतुक आए तो घंटी बजाएं और वाइब्रेट करें', hear: 'सुनें',
      setTone: 'सूचना की धुन सेट करें', nNA: 'यहाँ सूचनाएं उपलब्ध नहीं हैं।',
      nNAios: 'होम स्क्रीन से Gate खोलें (iOS 16.4 या नया)।', nNAother: 'यह ऐप Chrome में खोलें।',
      nNAuntil: 'तब तक, आगंतुकों के लिए यह स्क्रीन देखते रहें।',
      nBlocked: '<b>सूचनाएं बंद हैं।</b> फ़ोन की सेटिंग में इस ऐप के लिए अनुमति दें, फिर इसे दोबारा खोलें।',
      nOff: 'आगंतुक के आने का पता चले, इसके लिए <b>सूचनाएं चालू करें</b>।', nOffBtn: 'सूचनाएं चालू करें',
      nOn: '🔔 सूचनाएं चालू हैं', sendTest: 'टेस्ट भेजें', testSent: 'टेस्ट भेजा गया। कुछ सेकंड में आ जाना चाहिए।',
      leaveQ: 'इस फ़ोन पर फ्लैट {f} के आगंतुक अनुरोध बंद करें?', left: 'आपने फ्लैट छोड़ दिया। फिर से जुड़ने के लिए अपनी पर्ची स्कैन करें।',
      language: 'भाषा',
      e_tooManyCodes: 'इस फ्लैट के लिए बहुत अधिक गलत कोड। एक घंटे बाद कोशिश करें।',
      e_codeMismatch: 'फ्लैट और कोड मेल नहीं खाते। अपने फ्लैट की पर्ची जांचें।',
      e_errName: 'कृपया अपना नाम लिखें।',
      e_flatFull: 'फ्लैट {f} में पहले से {n} फ़ोन पंजीकृत हैं, जो सीमा है। किसी एक को उसके ऐप से हटाएं (यह फ्लैट छोड़ें), या संघ से पूछें।',
      e_notYourFlat: 'यह आगंतुक अनुरोध आपके फ्लैट के लिए नहीं है।',
      e_gone: 'यह फ़ोन अब पंजीकृत नहीं है। अपनी पर्ची से फ्लैट में फिर से जुड़ें।',
      e_notifNotOn: 'इस फ़ोन पर अभी सूचनाएं चालू नहीं हैं।',
      e_testFailed: 'इस फ़ोन पर सूचना नहीं भेजी जा सकी। ऐप में सूचनाएं बंद करके फिर चालू करें।',
      e_generic: 'कुछ गड़बड़ हो गई।'
    }
  };
  var lang = (function () { try { return localStorage.getItem('gate.lang'); } catch (e) { return null; } })();
  if (!T[lang]) lang = 'en';
  document.documentElement.lang = lang;
  function t(k, vals) {
    var s = (T[lang] && T[lang][k]) || T.en[k] || k;
    return s.replace(/\{(\w+)\}/g, function (m, n) { return vals && vals[n] !== undefined ? esc(vals[n]) : m; });
  }
  function purposeText(p) { return (PURPOSES[p] && PURPOSES[p][lang]) || (p === '(voice note)' ? t('voiceNote') : p); }
  function errText(e) { return e && e.key && T.en['e_' + e.key] ? t('e_' + e.key, e.params) : (e && e.message) || t('wrong'); }
  function langBar() {
    return '<div class="langs" role="group" aria-label="Language">' + ['en', 'ta', 'hi'].map(function (l) {
      return '<button type="button" data-lang="' + l + '" lang="' + l + '" class="' + (l === lang ? 'on' : '') + '">' + LANG_NAMES[l] + '</button>';
    }).join('') + '</div>';
  }
  var redraw = null; // re-renders the current screen after a language change
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-lang]');
    if (!b) return;
    var drafts = {};
    ['fl', 'cd', 'nm'].forEach(function (id) { if ($(id)) drafts[id] = $(id).value; });
    lang = b.getAttribute('data-lang');
    store.set('lang', lang);
    document.documentElement.lang = lang;
    if (store.get('key')) api('lang', { key: store.get('key'), lang: lang }).catch(function () {});
    if (redraw) redraw();
    Object.keys(drafts).forEach(function (id) { if ($(id)) $(id).value = drafts[id]; });
  });
  function passChoice() {
    var saved = store.get('passmin');
    if (saved && PASS_CHOICES.some(function (c) { return c[0] === saved; })) return saved;
    var d = String(passDefault);
    return PASS_CHOICES.some(function (c) { return c[0] === d; }) ? d : '30';
  }
  function choiceMinutes(c) {
    if (c !== 'm') return Number(c);
    var end = new Date(); end.setHours(23, 59, 0, 0);
    return Math.max(5, Math.round((end - Date.now()) / 60000));
  }

  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  /* ---------------------------------------------------------------- helpers */
  var store = {
    get: function (k) { try { return localStorage.getItem('gate.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem('gate.' + k); else localStorage.setItem('gate.' + k, v); } catch (e) {} },
  };
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function show(html) { app.innerHTML = langBar() + html; }
  function fmtTime(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    if (lang !== 'en') {
      try { return d.toLocaleTimeString(LOCALES[lang], { hour: 'numeric', minute: '2-digit', hour12: true }); } catch (e) {}
    }
    var h = d.getHours(), m = d.getMinutes();
    return ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function fmtDay(ms) {
    var d = new Date(ms), t = new Date();
    if (d.toDateString() === t.toDateString()) return T[lang].today;
    t.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return T[lang].yesterday;
    if (lang !== 'en') { try { return d.toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'short' }); } catch (e) {} }
    return d.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  }
  function ago(ms) {
    var m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return m < 1 ? t('justNow') : m === 1 ? t('min1') : m < 60 ? t('minN', { n: m }) : t('hN', { n: Math.round(m / 60) });
  }
  function toast(text) {
    var el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }
  /* ---------------------------------------------------- chime (app open) */
  var actx = null;
  function audioCtx() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); } catch (e) { return null; }
    }
    return actx;
  }
  function unlockAudio() { var c = audioCtx(); if (c && c.state === 'suspended') c.resume(); }
  document.addEventListener('touchstart', unlockAudio, { passive: true });
  document.addEventListener('click', unlockAudio);

  /** Two-tone "ding-dong", twice, plus a vibration on Android. */
  function chime(force) {
    if (!force && store.get('chime') === 'off') return;
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    var c = audioCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    var t = c.currentTime + 0.05;
    [[659.25, 0], [523.25, 0.55], [659.25, 1.3], [523.25, 1.85]].forEach(function (n) {
      [[1, 0.45], [2, 0.12]].forEach(function (h) { // note + a soft overtone for a bell-like sound
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.value = n[0] * h[0];
        g.gain.setValueAtTime(0.0001, t + n[1]);
        g.gain.exponentialRampToValueAtTime(h[1], t + n[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + 0.5);
        o.connect(g); g.connect(c.destination);
        o.start(t + n[1]); o.stop(t + n[1] + 0.55);
      });
    });
  }

  function api(a, body) {
    return fetch(API, { method: 'POST', body: JSON.stringify(Object.assign({ a: a }, body || {})) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) { var e = new Error(j.error || t('wrong')); e.code = j.code; e.key = j.key; e.params = j.params; throw e; }
        return j;
      });
  }
  function platformName() {
    var ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || isIOS) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    return 'Computer';
  }
  function pushSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && !!messaging;
  }

  /* ------------------------------------------------------------------ start */
  function init() {
    if (!API || /PASTE_YOUR/.test(API)) {
      redraw = init;
      return show('<div class="card"><h2>' + t('setup') + '</h2><p class="note">' + t('setupBody') + '</p></div>');
    }
    var q = new URLSearchParams(location.search);
    highlight = q.get('v');
    if (q.get('f')) store.set('pf', q.get('f'));
    if (q.get('c')) store.set('pc', q.get('c'));
    if (q.get('f') || q.get('c') || q.get('v')) {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }
    try { cfg = JSON.parse(store.get('cfg') || 'null'); } catch (e) { cfg = null; }
    return api('config').then(function (c) { cfg = c; store.set('cfg', JSON.stringify(c)); }, function () {
      if (!cfg) throw new Error('offline');
    }).then(function () {
      document.title = cfg.society + ' Gate';
      return setupMessaging();
    }).then(function () {
      if (store.get('key')) home(); else join();
    }).catch(function () {
      redraw = function () { show('<div class="card"><h2>' + t('noConn') + '</h2><p class="note">' + t('noConnBody') + '</p>' +
        '<button class="btn" onclick="location.reload()">' + t('tryAgain') + '</button></div>'); };
      redraw();
    });
  }

  function setupMessaging() {
    if (!('serviceWorker' in navigator)) return Promise.resolve();
    var fb = cfg.firebase || {};
    return navigator.serviceWorker.register('sw.js?cfg=' + encodeURIComponent(JSON.stringify(fb)))
      .then(function (reg) { swReg = reg; }, function (e) { console.warn('Service worker', e); })
      .then(function () {
        if (!window.firebase || !fb.apiKey || !swReg) return;
        return Promise.resolve(firebase.messaging.isSupported ? firebase.messaging.isSupported() : true).then(function (ok) {
          if (!ok) return;
          if (!firebase.apps.length) firebase.initializeApp(fb);
          messaging = firebase.messaging();
          messaging.onMessage(onForegroundMessage);
        });
      }).catch(function (e) { console.warn('Messaging', e); messaging = null; });
  }

  function getPushToken() {
    if (!messaging || !swReg) return Promise.resolve('');
    return messaging.getToken({ vapidKey: cfg.vapidKey, serviceWorkerRegistration: swReg }).catch(function (e) {
      console.warn('Token', e); return '';
    });
  }

  function onForegroundMessage(payload) {
    var n = (payload && payload.notification) || {};
    if (payload && payload.data && payload.data.kind === 'test') chime();
    if (swReg && Notification.permission === 'granted' && n.title) {
      swReg.showNotification(n.title, { body: n.body, icon: 'icon-192.png', tag: (payload.data && payload.data.id) || 'gate' });
    }
    if (payload && payload.data && payload.data.id) highlight = payload.data.id;
    if (store.get('key')) refresh();
  }

  /* ------------------------------------------------------------------- join */
  function join(message) {
    redraw = function () { join(message); };
    var f = store.get('pf') || '', c = store.get('pc') || '';
    var head = '<div class="top"><div><h1>' + esc(cfg.society) + '</h1><p class="sub">' + t('gateApprovals') + '</p></div></div>';
    if (isIOS && !standalone) {
      return show(head + '<div class="card"><h2>' + t('installFirst') + '</h2>' +
        '<p class="note">' + t('iosNote') + '</p>' +
        '<ol class="steps"><li>' + t('ios1') + '</li><li>' + t('ios2') + '</li><li>' + t('ios3') + '</li><li>' + t('ios4') + '</li></ol>' +
        (f || c ? '<div class="code">' + t('flatCode', { f: f, c: c }) + '</div>' : '') +
        '<p class="tiny">' + t('iosTiny') + '</p></div>');
    }
    show(head + '<div class="card"><h2>' + t('joinFlat') + '</h2>' +
      '<p class="note">' + t('joinNote') + '</p>' +
      '<label class="f" for="fl">' + t('flat') + '</label><input id="fl" value="' + esc(f) + '" autocapitalize="characters" placeholder="' + t('flatPh') + '">' +
      '<label class="f" for="cd">' + t('code') + '</label><input id="cd" value="' + esc(c) + '" autocapitalize="characters" maxlength="6" placeholder="' + t('codePh') + '">' +
      '<label class="f" for="nm">' + t('yourName') + '</label><input id="nm" maxlength="40" autocomplete="name" placeholder="' + t('namePh') + '">' +
      '<button id="go" class="btn">' + t('joinBtn') + '</button>' +
      '<div id="er" class="err">' + (message ? (typeof message === 'string' ? esc(message) : esc(errText(message))) : '') + '</div></div>' +
      '<p class="tiny">' + t('joinTiny') + '</p>');
    $('go').addEventListener('click', doJoin);
  }

  function doJoin() {
    var btn = $('go'), er = $('er');
    var flat = $('fl').value.trim(), code = $('cd').value.trim().toUpperCase(), name = $('nm').value.trim();
    er.textContent = '';
    if (!flat) return er.textContent = t('eFlat');
    if (code.length !== 6) return er.textContent = t('eCode');
    if (name.length < 2) return er.textContent = t('eName');
    btn.disabled = true; btn.textContent = t('joining');
    // Ask for notification permission first: phones only allow it straight after a tap.
    var perm = ('Notification' in window && messaging) ? Notification.requestPermission() : Promise.resolve('unsupported');
    Promise.resolve(perm).catch(function () { return 'denied'; }).then(function (p) {
      return p === 'granted' ? getPushToken() : '';
    }).then(function (token) {
      return api('join', { flat: flat, code: code, name: name, token: token, platform: platformName(), lang: lang, oldKey: store.get('key') || '' })
        .then(function (r) {
          store.set('key', r.key); store.set('flat', r.flat); store.set('name', r.name); store.set('token', token || '');
          store.set('pf', null); store.set('pc', null);
          toast(t('joined', { f: r.flat }));
          home();
        });
    }).catch(function (e) {
      er.textContent = errText(e); btn.disabled = false; btn.textContent = t('joinBtn');
    });
  }

  /* ------------------------------------------------------------------- home */
  var lastHome = null;
  function home() {
    redraw = function () { var keep = seenIds; home(); seenIds = keep; if (lastHome) render(lastHome); };
    seenIds = null;
    show('<div class="top"><div><h1>' + t('flatN', { f: store.get('flat') }) + '</h1><p class="sub" id="who">' + esc(store.get('name')) +
      ' · ' + esc(cfg.society) + '</p></div></div>' +
      '<div id="nb"></div>' +
      '<div id="pending"><div class="empty">' + t('loading') + '</div></div>' +
      '<div class="card"><h2>' + t('recent') + '</h2><ul class="recent" id="recent"><li class="tiny">' + t('loading') + '</li></ul></div>' +
      alertsCard() +
      '<p class="tiny" style="text-align:center" id="st"></p>' +
      '<p style="text-align:center"><button class="linkbtn" id="leave">' + t('leaveBtn', { f: store.get('flat') }) + '</button></p>');
    $('leave').addEventListener('click', leave);
    $('chime').addEventListener('change', function () { store.set('chime', $('chime').checked ? null : 'off'); });
    $('hear').addEventListener('click', function () { unlockAudio(); chime(true); });
    renderNotifBanner();
    refresh();
    clearInterval(timer);
    timer = setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, 15000);
    syncToken();
  }

  function refresh() {
    if (busy) return Promise.resolve();
    busy = true;
    return api('home', { key: store.get('key') }).then(function (h) {
      busy = false;
      if (h.flat !== store.get('flat')) store.set('flat', h.flat);
      if (h.passDefaultMin) passDefault = h.passDefaultMin;
      lastHome = h;
      render(h);
      if ($('st')) $('st').textContent = T[lang].updated.replace('{t}', fmtTime(Date.now()));
    }).catch(function (e) {
      busy = false;
      if (e.code === 'GONE') {
        clearInterval(timer);
        store.set('key', null);
        return join(e);
      }
      if ($('st')) $('st').textContent = t('offline');
    });
  }

  function render(h) {
    var p = $('pending'), rc = $('recent');
    if (!p) return;
    var ids = h.pending.map(function (v) { return String(v.id); });
    if (seenIds && ids.some(function (id) { return seenIds.indexOf(id) < 0; }) && document.visibilityState !== 'hidden') chime();
    seenIds = ids.concat(seenIds || []);
    if (!h.pending.length) {
      p.innerHTML = '<div class="card empty">' + t('noneWaiting') + '</div>';
    } else {
      p.innerHTML = h.pending.map(function (v) {
        return '<div class="card visitor' + (String(v.id) === String(highlight) ? ' hl' : '') + '" id="v' + v.id + '">' +
          '<h2>' + t('atGate') + '</h2>' +
          (v.photo ? '<img src="' + v.photo + '" alt="">' : '<p class="note">' + t('photoNA') + '</p>') +
          '<div class="vname">' + esc(v.name) + '</div>' +
          '<div class="vline">' + esc(v.phone) + '</div>' +
          (v.purpose && v.purpose !== '(voice note)' ? '<div class="purpose"><span>' + t('purpose') + '</span>' + esc(purposeText(v.purpose)) + '</div>' : '') +
          (v.voice ? '<div class="vnote"><span>' + t('voiceNote') + '</span><audio controls preload="metadata" src="' + v.voice + '"></audio></div>' : '') +
          '<div class="vline">' + T[lang].waitingSince.replace('{t}', fmtTime(v.createdMs)).replace('{a}', ago(v.createdMs)) + '</div>' +
          '<div class="validfor"><span>' + t('validFor') + '</span><div class="pchips">' +
            PASS_CHOICES.map(function (c) {
              return '<button type="button" class="pchip' + (c[0] === passChoice() ? ' on' : '') + '" data-p="' + c[0] + '">' + t(c[1]) + '</button>';
            }).join('') + '</div></div>' +
          '<div class="row"><button class="btn red" data-id="' + v.id + '" data-a="D">' + t('deny') + '</button>' +
          '<button class="btn green" data-id="' + v.id + '" data-a="A">' + t('approve') + '</button></div></div>';
      }).join('');
      Array.prototype.forEach.call(p.querySelectorAll('button[data-id]'), function (b) {
        b.addEventListener('click', function () {
          var card = $('v' + b.getAttribute('data-id'));
          var on = card.querySelector('.pchip.on');
          decide(b.getAttribute('data-id'), b.getAttribute('data-a'), on ? on.getAttribute('data-p') : passChoice());
        });
      });
      Array.prototype.forEach.call(p.querySelectorAll('.pchip'), function (c) {
        c.addEventListener('click', function () {
          Array.prototype.forEach.call(c.parentNode.querySelectorAll('.pchip'), function (x) { x.classList.toggle('on', x === c); });
          store.set('passmin', c.getAttribute('data-p'));
        });
      });
      if (highlight && $('v' + highlight)) $('v' + highlight).scrollIntoView({ block: 'start' });
    }
    rc.innerHTML = h.recent.length ? h.recent.map(function (v) {
      var label = T[lang][v.status] ? t(v.status) : esc(v.status);
      if (v.status === 'APPROVED' && v.untilMs) label += '<span class="tiny" style="display:block;text-align:right;font-weight:400">' +
        T[lang][v.untilMs > Date.now() ? 'until' : 'ended'].replace('{t}', fmtTime(v.untilMs)) + '</span>';
      return '<li><div><b>' + esc(v.name) + '</b>' + (v.purpose ? ' · ' + esc(purposeText(v.purpose)) : '') +
        '<div class="tiny">' + fmtDay(v.createdMs) + ', ' + fmtTime(v.createdMs) +
        (v.by ? ' · ' + esc(v.by) : '') + '</div></div><span class="st ' + esc(v.status) + '">' + label + '</span></li>';
    }).join('') : '<li class="tiny">' + t('noVisitors') + '</li>';
  }

  function decide(id, action, choice) {
    var card = $('v' + id);
    Array.prototype.forEach.call(card.querySelectorAll('button'), function (b) { b.disabled = true; });
    api('decide', { key: store.get('key'), id: id, action: action, validMin: choiceMinutes(choice || passChoice()) }).then(function (r) {
      if (r.status === 'EXPIRED') toast(T[lang].alreadyExpired);
      else if (r.already) toast(T[lang][r.status === 'APPROVED' ? 'alreadyA' : 'alreadyD'].replace('{by}', r.by));
      else toast(r.status === 'APPROVED' ? T[lang].approvedT.replace('{t}', fmtTime(r.untilMs)) : T[lang].deniedT);
      highlight = null;
      refresh();
    }).catch(function (e) {
      toast(errText(e));
      Array.prototype.forEach.call(card.querySelectorAll('button'), function (b) { b.disabled = false; });
      if (e.code === 'GONE') refresh();
    });
  }

  function alertsCard() {
    var tone = isIOS ? '<p class="note">' + t('toneIOS') + '</p>'
      : '<ol class="steps"><li>' + t('tone1') + '</li><li>' + t('tone2') + '</li><li>' + t('tone3') + '</li></ol>';
    return '<div class="card"><h2>' + t('alerts') + '</h2>' +
      '<div class="toggle"><label><input type="checkbox" id="chime"' + (store.get('chime') === 'off' ? '' : ' checked') + '> ' +
      t('chimeLbl') + '</label>' +
      '<button class="linkbtn" id="hear">' + t('hear') + '</button></div>' +
      '<details><summary>' + t('setTone') + '</summary>' + tone + '</details></div>';
  }

  function renderNotifBanner() {
    var nb = $('nb');
    if (!nb) return;
    if (!pushSupported()) {
      nb.innerHTML = '<div class="banner bad"><b>' + t('nNA') + '</b> ' + t(isIOS ? 'nNAios' : 'nNAother') + ' ' + t('nNAuntil') + '</div>';
    } else if (Notification.permission === 'denied') {
      nb.innerHTML = '<div class="banner bad">' + t('nBlocked') + '</div>';
    } else if (Notification.permission !== 'granted') {
      nb.innerHTML = '<div class="banner warn">' + t('nOff') +
        '<button class="btn small" id="non">' + t('nOffBtn') + '</button></div>';
      $('non').addEventListener('click', function () {
        Notification.requestPermission().then(function () { renderNotifBanner(); return syncToken(); });
      });
    } else {
      nb.innerHTML = '<div class="banner ok"><span>' + t('nOn') + '</span><button class="linkbtn" id="tst">' + t('sendTest') + '</button></div>';
      $('tst').addEventListener('click', function () {
        syncToken(true).then(function () { return api('test', { key: store.get('key') }); })
          .then(function () { toast(t('testSent')); }, function (e) { toast(errText(e)); });
      });
    }
  }

  function syncToken(force) {
    if (!pushSupported() || Notification.permission !== 'granted') return Promise.resolve();
    return getPushToken().then(function (tok) {
      if (tok && (force || tok !== store.get('token'))) {
        return api('token', { key: store.get('key'), token: tok }).then(function () { store.set('token', tok); });
      }
    }).catch(function () {});
  }

  function leave() {
    if (!confirm(T[lang].leaveQ.replace('{f}', store.get('flat')))) return;
    api('leave', { key: store.get('key') }).catch(function () {}).then(function () {
      clearInterval(timer);
      store.set('key', null); store.set('flat', null); store.set('name', null);
      join(t('left'));
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && store.get('key') && cfg) { renderNotifBanner(); refresh(); }
  });

  window.GATEAPP = { init: init, refresh: refresh, onForegroundMessage: onForegroundMessage };
  init();
})();
