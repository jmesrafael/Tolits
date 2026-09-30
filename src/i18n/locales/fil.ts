import type { strings as en } from '../strings';

/**
 * Tagalog (Filipino) overrides, merged onto the English dictionary at read
 * time (see useStrings.ts) so any key missing here falls back to English
 * instead of rendering undefined. Scoped to onboarding, setup, the tour's
 * shared chrome, and Help & Tutorials (LOCALIZATION.md scope for this pass);
 * everything else (tabs, dashboard labels, per-tour step content, component
 * names) still reads English until a later pass extends this file.
 *
 * Tone: casual, conversational Taglish, the way riders actually talk, not
 * textbook Tagalog. English terms riders already use daily (odometer, OR/CR,
 * maintenance, tire, chain, brake) are kept as-is.
 */

type DeepPartial<T> = T extends readonly (infer U)[]
  ? readonly DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : string;

export const fil: DeepPartial<typeof en> = {
  dashboard: {
    health: {
      estimated: 'Batay sa tantiyang mileage',
    },
    odometer: {
      noReading: 'Wala pang reading',
      estimated: '~{km} tantiya ngayon',
      estimatedRough: '~{km} rough estimate lang ngayon',
      needsReading: 'Mag-log ng isa pang reading para ma-estimate ang mileage',
    },
  },
  odometerReference: {
    none: 'Wala pang odometer reading',
    actual: 'Huling reading: {km} noong {date}',
    withEstimate: 'Huling reading: {km} noong {date} · ~{estimate} tantiya ngayon',
    withRoughEstimate: 'Huling reading: {km} noong {date} · ~{estimate} rough estimate lang ngayon',
    needsReading: 'Huling reading: {km} noong {date} · mag-log ng isa pang reading para ma-estimate ang mileage ngayon',
    optionalHint: '{reference}. Iwanang blangko kung hindi mo alam ang reading.',
    requiredError: 'Ilagay ang odometer reading na nasa motor mo.',
  },
  baseline: {
    notSetUp: 'Hindi pa naka-set up. Ilagay ang odometer reading noong huli itong ginawa. Kung ngayong araw ginawa, i-tap ang Just serviced today (ilagay muna ang reading ngayon kung alam mo).',
    needsKm: 'Ilagay ang odometer reading noong huli itong ginawa',
  },
  remindersList: {
    notificationsEnded: 'Overdue simula {date}. Wala nang ipapadalang notification para dito; i-log ito kapag nagawa na.',
  },
  dataPrivacy: {
    deleted: 'Nabura na ang lahat ng data',
    deletedFilesRemain: 'Nabura na ang lahat ng record, pero may ilang naka-save na file na hindi nabura',
  },
  onboarding: {
    carousel: {
      skip: 'Laktawan',
      next: 'Susunod',
      getStarted: 'Simulan na',
      stages: [
        {
          eyebrow: '01',
          title: 'Kilalanin ang motor mo',
          body: 'Nasa iisang lugar na lang ang lahat: model, plaka, VIN, at ang odometer na pinagbabasehan ng lahat dito.',
        },
        {
          eyebrow: '02',
          title: 'Huwag kalimutan ang maintenance',
          body: 'I-track ang mga service, schedule, at mileage mo, tapos may live Health Score pa para alam mo agad kung kumusta ang motor mo.',
        },
        {
          eyebrow: '03',
          title: 'I-keep ang history mo',
          body: 'Buuin ang totoong maintenance history mo. Bawat service, bawat pisong nagastos, nasa isang searchable na timeline.',
        },
      ],
    },
    language: {
      title: 'Piliin ang wika mo',
      body: 'Piliin kung anong wika ang gagamitin mo sa Tolits. Puwede mo pa rin itong baguhin anumang oras sa Settings.',
      english: 'English',
      englishHint: 'Gamitin ang English sa buong app',
      tagalog: 'Tagalog',
      tagalogHint: 'Gamitin ang Tagalog sa buong app',
      continue: 'Magpatuloy',
    },
    setup: {
      title: 'I-set up ang motor mo',
      stepOf: 'Hakbang {current} ng {total}',
      skipStep: 'Laktawan ang hakbang na ito',
      back: 'Bumalik',
      next: 'Susunod',
      finish: 'Tapusin',
      closeA11y: 'Lumabas sa setup',
      exitTitle: 'Lumabas sa setup?',
      exitBody: 'Puwede mo pa ring idagdag ang motor mo at history mamaya sa Garage.',
      exitConfirm: 'Lumabas sa setup',
      bike: {
        title: 'Idagdag ang motor mo',
        body: 'Sabihin sa amin ang basics: model, plaka, at kasalukuyang odometer.',
        why: 'Dito babase ang dashboard mo at ang mga reminder mo.',
      },
      oil: {
        title: 'Huling pagpalit ng oil',
        body: 'Kailan mo huling pinalitan ang engine oil? Laktawan na lang kung hindi sure.',
        why: 'Gagamitin namin ito para simulan ang maintenance schedule mo.',
        dateLabel: 'Petsa ng huling pagpalit ng oil',
        odoLabel: 'Odometer noon (km, optional)',
        save: 'I-save ang oil change',
        saved: 'Na-record na ang oil change.',
      },
      done: {
        title: 'Tapos ka na',
        body: 'Handa na ang garahe mo. Susunod, ang dashboard.',
        cta: 'Pumunta sa dashboard',
      },
    },
  },
  tutorial: {
    common: {
      next: 'Susunod',
      back: 'Bumalik',
      done: 'Tapos',
      skip: 'Laktawan ang tour',
      closeA11y: 'Isara ang tutorial',
      stepOf: 'Hakbang {current} ng {total}',
      tryIt: 'Subukan mo: i-tap ang naka-highlight na bahagi.',
      tryItLong: 'Subukan mo: pindutin nang matagal ang naka-highlight na bahagi.',
      tryItNavigate: 'Subukan mo ngayon. Magpapatuloy ang tour sa susunod na screen.',
      tryItSave: 'Subukan mo ngayon. Magpapatuloy ang tour pagkatapos mong mag-save.',
    },
    offer: {
      title: 'Gusto mo ba ng mabilisang tour?',
      body: 'Mga 3 minuto lang, puwede mo itong laktawan anumang oras. Puwede mo rin itong ulitin mamaya sa Settings.',
      start: 'Simulan ang tour',
      later: 'Sa ibang pagkakataon na lang',
      never: 'Huwag nang ipakita ulit',
    },
    resume: {
      title: 'Ituloy ang tour?',
      body: 'May tour kang hindi natapos.',
      resume: 'Ituloy',
      restart: 'Ulitin mula sa simula',
      dismiss: 'Sa ibang pagkakataon na lang',
    },
  },
  help: {
    title: 'Tulong at mga tutorial',
    toursSection: 'Mga guided tour',
    articlesSection: 'Mga gabay',
    optionsSection: 'Mga option',
    status: {
      completed: 'Tapos na',
      inProgress: 'Ginagawa pa',
      skipped: 'Nilaktawan',
      notStarted: 'Hindi pa nasisimulan',
    },
    replayA11y: 'Ulitin ang {title}',
    tutorialMode: 'Tutorial Mode',
    tutorialModeCaption: 'Ipakita ulit ang lahat ng tip at coach mark. Hindi ito makakaapekto sa data mo.',
    showOfferAgain: 'Ipakitang muli ang alok ng tour',
    resetProgress: 'I-reset ang tutorial progress',
    resetTitle: 'I-reset ang tutorial progress?',
    resetBody: 'Babalik sa "hindi pa nakita" ang mga tour, tip, at onboarding mo. Hindi ito makakaapekto sa mga naka-save mong motor, maintenance, gasolina, gastos, at dokumento.',
    resetConfirm: 'I-reset ang progress',
    maintenanceDates: {
      rowTitle: 'Paano i-track ang maintenance dates',
      title: 'Paano i-track ang maintenance dates',
      whenTitle: 'Kailan mag-log ng service',
      whenBody: 'I-log agad ang ginawang maintenance, tulad ng oil change o bagong brake pads. Gagamitin ng Tolits ang petsa at odometer reading na iyon para malaman kung kailan ang susunod.',
      datesTitle: 'Paano gumagana ang mga petsa',
      datesBody: 'Naaalala ng bawat component ang huling petsa na na-service ito. Puwede mo itong i-update anumang oras mula sa component screen sa Maintenance, hindi na kailangang i-set habang setup pa lang.',
      intervalsTitle: 'Paano gumagana ang odometer interval',
      intervalsBody: 'May recommended interval ang bawat component, sa kilometro, buwan, o pareho. Bibilangin ito ng Tolits mula sa huli mong log para malaman mo kung kailan ito magiging due.',
      remindersTitle: 'Paano ginagamit ito ng reminders',
      remindersBody: 'Kapag malapit nang mag-due o overdue na ang isang component, lalabas ito sa dashboard mo at puwede kang bigyan ng Tolits ng reminder. Mas tumpak ang mga estimate na ito kapag updated ang odometer mo.',
    },
  },
};
