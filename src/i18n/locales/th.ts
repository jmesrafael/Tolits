import type { strings as en } from '../strings';

/**
 * Thai overrides, merged onto the English dictionary at read time (see
 * useStrings.ts) so any key missing here falls back to English instead of
 * rendering undefined. Scoped to onboarding, setup, the tour's shared chrome,
 * and Help & Tutorials — same pass boundary as locales/fil.ts; everything
 * else (tabs, dashboard labels, per-tour step content, component names)
 * still reads English until a later pass extends this file.
 *
 * Machine-translated; needs native-speaker review before release
 * (LOCALIZATION.md §6).
 */

type DeepPartial<T> = T extends readonly (infer U)[]
  ? readonly DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : string;

export const th: DeepPartial<typeof en> = {
  dashboard: {
    health: {
      estimated: 'อ้างอิงจากระยะทางโดยประมาณ',
    },
    odometer: {
      noReading: 'ยังไม่มีเลขไมล์',
      estimated: '~{km} ประมาณการวันนี้',
      estimatedRough: '~{km} ประมาณการคร่าวๆ วันนี้',
      needsReading: 'บันทึกเลขไมล์อีกครั้งเพื่อประมาณระยะทาง',
    },
  },
  odometerReference: {
    none: 'ยังไม่มีเลขไมล์',
    actual: 'เลขไมล์ล่าสุด: {km} เมื่อ {date}',
    withEstimate: 'เลขไมล์ล่าสุด: {km} เมื่อ {date} · ~{estimate} ประมาณการวันนี้',
    withRoughEstimate: 'เลขไมล์ล่าสุด: {km} เมื่อ {date} · ~{estimate} ประมาณการคร่าวๆ วันนี้',
    needsReading: 'เลขไมล์ล่าสุด: {km} เมื่อ {date} · บันทึกเลขไมล์อีกครั้งเพื่อประมาณระยะทางปัจจุบัน',
    optionalHint: '{reference} เว้นว่างไว้หากไม่ทราบเลขไมล์',
    requiredError: 'กรอกเลขไมล์ที่แสดงบนรถของคุณ',
  },
  baseline: {
    notSetUp: 'ยังไม่ได้ตั้งค่า กรอกเลขไมล์ตอนที่ทำครั้งล่าสุด หากเพิ่งทำวันนี้ ให้แตะ Just serviced today (กรอกเลขไมล์วันนี้ก่อนหากทราบ)',
    needsKm: 'กรอกเลขไมล์ตอนที่ทำครั้งล่าสุด',
  },
  remindersList: {
    notificationsEnded: 'เกินกำหนดตั้งแต่ {date} จะไม่มีการแจ้งเตือนรายการนี้อีก บันทึกเมื่อทำเสร็จแล้ว',
  },
  dataPrivacy: {
    deleted: 'ลบข้อมูลทั้งหมดแล้ว',
    deletedFilesRemain: 'ลบบันทึกทั้งหมดแล้ว แต่ไม่สามารถลบไฟล์ที่บันทึกไว้บางไฟล์ได้',
  },
  onboarding: {
    carousel: {
      skip: 'ข้าม',
      next: 'ถัดไป',
      getStarted: 'เริ่มต้นใช้งาน',
      stages: [
        {
          eyebrow: '01',
          title: 'รู้จักรถของคุณ',
          body: 'เก็บข้อมูลรถของคุณไว้ในที่เดียว: รุ่น ทะเบียน เลขตัวถัง (VIN) และเลขไมล์ ซึ่งเป็นพื้นฐานของทุกฟีเจอร์',
        },
        {
          eyebrow: '02',
          title: 'ไม่พลาดการซ่อมบำรุง',
          body: 'ติดตามการบริการ ตารางเวลา และระยะทาง พร้อมคะแนนสุขภาพแบบเรียลไทม์ เพื่อให้คุณรู้สภาพรถเสมอ',
        },
        {
          eyebrow: '03',
          title: 'เก็บประวัติของคุณ',
          body: 'สร้างประวัติการซ่อมบำรุงที่แท้จริงเมื่อเวลาผ่านไป ทุกการบริการ ทุกบาทที่จ่าย รวมอยู่ในไทม์ไลน์เดียวที่ค้นหาได้',
        },
      ],
    },
    language: {
      title: 'เลือกภาษาของคุณ',
      body: 'เลือกภาษาที่คุณต้องการให้ Tolits ใช้ คุณสามารถเปลี่ยนได้ทุกเมื่อในการตั้งค่า',
      english: 'English',
      englishHint: 'ใช้ภาษาอังกฤษทั่วทั้งแอป',
      tagalog: 'Tagalog',
      tagalogHint: 'ใช้ภาษาตากาล็อกทั่วทั้งแอป',
      vietnamese: 'Tiếng Việt',
      vietnameseHint: 'ใช้ภาษาเวียดนามทั่วทั้งแอป',
      indonesian: 'Bahasa Indonesia',
      indonesianHint: 'ใช้ภาษาอินโดนีเซียทั่วทั้งแอป',
      thai: 'ภาษาไทย',
      thaiHint: 'ใช้ภาษาไทยทั่วทั้งแอป',
      continue: 'ดำเนินการต่อ',
    },
    setup: {
      title: 'ตั้งค่ารถของคุณ',
      stepOf: 'ขั้นตอน {current} จาก {total}',
      skipStep: 'ข้ามขั้นตอนนี้',
      back: 'ย้อนกลับ',
      next: 'ถัดไป',
      finish: 'เสร็จสิ้น',
      closeA11y: 'ออกจากการตั้งค่า',
      exitTitle: 'ออกจากการตั้งค่า?',
      exitBody: 'คุณสามารถเพิ่มรถและประวัติได้ภายหลังจากโรงรถ',
      exitConfirm: 'ออกจากการตั้งค่า',
      bike: {
        title: 'เพิ่มรถจักรยานยนต์ของคุณ',
        body: 'บอกข้อมูลพื้นฐานให้เราทราบ: รุ่น ทะเบียน และเลขไมล์ปัจจุบัน',
        why: 'นี่คือพื้นฐานของแดชบอร์ดและการแจ้งเตือนของคุณ',
      },
      oil: {
        title: 'การเปลี่ยนน้ำมันเครื่องครั้งล่าสุด',
        body: 'คุณเปลี่ยนน้ำมันเครื่องครั้งล่าสุดเมื่อไหร่? ข้ามได้หากไม่แน่ใจ',
        why: 'เราจะใช้ข้อมูลนี้เพื่อเริ่มตารางการซ่อมบำรุงของคุณ',
        dateLabel: 'วันที่เปลี่ยนน้ำมันเครื่องล่าสุด',
        odoLabel: 'เลขไมล์ในตอนนั้น (กม. ไม่บังคับ)',
        save: 'บันทึกการเปลี่ยนน้ำมันเครื่อง',
        saved: 'บันทึกการเปลี่ยนน้ำมันเครื่องแล้ว',
      },
      done: {
        title: 'พร้อมใช้งานแล้ว',
        body: 'โรงรถของคุณพร้อมแล้ว ต่อไปคือแดชบอร์ด',
        cta: 'ไปที่แดชบอร์ด',
      },
    },
  },
  tutorial: {
    common: {
      next: 'ถัดไป',
      back: 'ย้อนกลับ',
      done: 'เสร็จสิ้น',
      skip: 'ข้ามทัวร์',
      closeA11y: 'ปิดบทแนะนำ',
      stepOf: 'ขั้นตอน {current} จาก {total}',
      tryIt: 'ลองเลย: แตะที่ตัวควบคุมที่ไฮไลต์',
      tryItLong: 'ลองเลย: กดค้างที่ตัวควบคุมที่ไฮไลต์',
      tryItNavigate: 'ลองเลย ทัวร์จะดำเนินต่อในหน้าจอถัดไป',
      tryItSave: 'ลองเลย ทัวร์จะดำเนินต่อหลังจากคุณบันทึก',
    },
    offer: {
      title: 'ต้องการชมทัวร์แนะนำสั้นๆ ไหม?',
      body: 'ใช้เวลาประมาณ 3 นาที ข้ามได้ทุกเมื่อ คุณยังสามารถดูซ้ำได้ภายหลังจากการตั้งค่า',
      start: 'เริ่มทัวร์',
      later: 'ไว้ทีหลัง',
      never: 'ไม่ต้องแสดงอีก',
    },
    resume: {
      title: 'ดำเนินทัวร์ต่อไหม?',
      body: 'คุณหยุดทัวร์ไว้กลางคัน',
      resume: 'ดำเนินการต่อ',
      restart: 'เริ่มใหม่',
      dismiss: 'ไว้ทีหลัง',
    },
  },
  help: {
    title: 'ช่วยเหลือ & บทแนะนำ',
    toursSection: 'ทัวร์แนะนำ',
    articlesSection: 'คู่มือ',
    optionsSection: 'ตัวเลือก',
    status: {
      completed: 'เสร็จสมบูรณ์',
      inProgress: 'กำลังดำเนินการ',
      skipped: 'ข้ามแล้ว',
      notStarted: 'ยังไม่ได้เริ่ม',
    },
    replayA11y: 'ดู {title} อีกครั้ง',
    tutorialMode: 'โหมดบทแนะนำ',
    tutorialModeCaption: 'แสดงเคล็ดลับตามบริบทและคำแนะนำทั้งหมดอีกครั้ง ข้อมูลของคุณจะไม่ได้รับผลกระทบ',
    showOfferAgain: 'แสดงข้อเสนอทัวร์อีกครั้ง',
    resetProgress: 'รีเซ็ตความคืบหน้าบทแนะนำ',
    resetTitle: 'รีเซ็ตความคืบหน้าบทแนะนำ?',
    resetBody: 'ทัวร์ เคล็ดลับ และการแนะนำเบื้องต้นจะถูกทำเครื่องหมายว่ายังไม่เคยดู รถจักรยานยนต์ การซ่อมบำรุง น้ำมัน ค่าใช้จ่าย และเอกสารจะไม่ได้รับผลกระทบ',
    resetConfirm: 'รีเซ็ตความคืบหน้า',
    maintenanceDates: {
      rowTitle: 'วิธีติดตามวันที่ซ่อมบำรุง',
      title: 'วิธีติดตามวันที่ซ่อมบำรุง',
      whenTitle: 'เมื่อไหร่ควรบันทึกการบริการ',
      whenBody:
        'บันทึกรายการซ่อมบำรุงทันทีที่ทำเสร็จ เช่น การเปลี่ยนน้ำมันเครื่องหรือผ้าเบรกชุดใหม่ Tolits จะใช้วันที่และเลขไมล์นั้นเพื่อวางแผนครั้งถัดไป',
      datesTitle: 'วันที่ทำงานอย่างไร',
      datesBody:
        'แต่ละชิ้นส่วนจะจดจำวันที่บริการล่าสุด คุณสามารถอัปเดตได้ทุกเมื่อจากหน้าจอชิ้นส่วนในเมนูซ่อมบำรุง ไม่จำเป็นต้องตั้งค่าตั้งแต่ขั้นตอนแรก',
      intervalsTitle: 'ระยะเลขไมล์ทำงานอย่างไร',
      intervalsBody:
        'ทุกชิ้นส่วนมีระยะที่แนะนำ เป็นกิโลเมตร เดือน หรือทั้งสองอย่าง Tolits จะนับจากบันทึกล่าสุดของคุณเพื่อบอกคร่าวๆ ว่าครั้งถัดไปจะถึงกำหนดเมื่อไหร่',
      remindersTitle: 'การแจ้งเตือนใช้ข้อมูลนี้อย่างไร',
      remindersBody:
        'เมื่อชิ้นส่วนใกล้ถึงกำหนดหรือเลยกำหนด Tolits จะแสดงบนแดชบอร์ดของคุณและสามารถส่งการแจ้งเตือนได้ การอัปเดตเลขไมล์อยู่เสมอจะช่วยให้การประมาณการเหล่านี้แม่นยำ',
    },
  },
};
