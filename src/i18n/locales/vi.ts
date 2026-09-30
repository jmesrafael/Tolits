import type { strings as en } from '../strings';

/**
 * Vietnamese overrides, merged onto the English dictionary at read time (see
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

export const vi: DeepPartial<typeof en> = {
  dashboard: {
    health: {
      estimated: 'Dựa trên quãng đường ước tính',
    },
    odometer: {
      noReading: 'Chưa có số ODO',
      estimated: '~{km} ước tính hôm nay',
      estimatedRough: '~{km} ước tính sơ bộ hôm nay',
      needsReading: 'Nhập thêm một số ODO để ước tính quãng đường',
    },
  },
  odometerReference: {
    none: 'Chưa có số ODO',
    actual: 'Số ODO gần nhất: {km} ngày {date}',
    withEstimate: 'Số ODO gần nhất: {km} ngày {date} · ~{estimate} ước tính hôm nay',
    withRoughEstimate: 'Số ODO gần nhất: {km} ngày {date} · ~{estimate} ước tính sơ bộ hôm nay',
    needsReading: 'Số ODO gần nhất: {km} ngày {date} · nhập thêm một số ODO để ước tính quãng đường hiện tại',
    optionalHint: '{reference}. Để trống nếu bạn không biết số ODO.',
    requiredError: 'Nhập số ODO hiển thị trên xe của bạn.',
  },
  baseline: {
    notSetUp: 'Chưa thiết lập. Nhập số ODO lúc thực hiện lần gần nhất. Nếu vừa làm hôm nay, nhấn Just serviced today (nhập số ODO hôm nay trước nếu bạn biết).',
    needsKm: 'Nhập số ODO lúc thực hiện lần gần nhất',
  },
  remindersList: {
    notificationsEnded: 'Quá hạn từ {date}. Sẽ không gửi thêm thông báo cho mục này; hãy ghi lại khi đã làm xong.',
  },
  dataPrivacy: {
    deleted: 'Đã xóa toàn bộ dữ liệu',
    deletedFilesRemain: 'Đã xóa toàn bộ bản ghi, nhưng một số tệp đã lưu không thể xóa',
  },
  onboarding: {
    carousel: {
      skip: 'Bỏ qua',
      next: 'Tiếp theo',
      getStarted: 'Bắt đầu',
      stages: [
        {
          eyebrow: '01',
          title: 'Hiểu rõ xe của bạn',
          body: 'Lưu thông tin xe ở một nơi: dòng xe, biển số, số khung (VIN) và số ODO — nền tảng cho mọi tính năng khác.',
        },
        {
          eyebrow: '02',
          title: 'Không bao giờ bỏ lỡ bảo dưỡng',
          body: 'Theo dõi lịch sử bảo dưỡng, lịch trình và số km, cùng Điểm sức khỏe theo thời gian thực để luôn biết tình trạng xe.',
        },
        {
          eyebrow: '03',
          title: 'Lưu giữ lịch sử của bạn',
          body: 'Xây dựng lịch sử bảo dưỡng thực tế theo thời gian. Mọi lần bảo dưỡng, mọi khoản chi, tất cả trong một dòng thời gian có thể tìm kiếm.',
        },
      ],
    },
    language: {
      title: 'Chọn ngôn ngữ của bạn',
      body: 'Chọn ngôn ngữ bạn muốn Tolits sử dụng. Bạn có thể thay đổi bất cứ lúc nào trong Cài đặt.',
      english: 'English',
      englishHint: 'Sử dụng tiếng Anh trong toàn bộ ứng dụng',
      tagalog: 'Tagalog',
      tagalogHint: 'Sử dụng tiếng Tagalog trong toàn bộ ứng dụng',
      vietnamese: 'Tiếng Việt',
      vietnameseHint: 'Sử dụng tiếng Việt trong toàn bộ ứng dụng',
      indonesian: 'Bahasa Indonesia',
      indonesianHint: 'Sử dụng tiếng Indonesia trong toàn bộ ứng dụng',
      thai: 'ภาษาไทย',
      thaiHint: 'Sử dụng tiếng Thái trong toàn bộ ứng dụng',
      continue: 'Tiếp tục',
    },
    setup: {
      title: 'Thiết lập xe của bạn',
      stepOf: 'Bước {current}/{total}',
      skipStep: 'Bỏ qua bước này',
      back: 'Quay lại',
      next: 'Tiếp theo',
      finish: 'Hoàn tất',
      closeA11y: 'Thoát thiết lập',
      exitTitle: 'Thoát thiết lập?',
      exitBody: 'Bạn có thể thêm xe và lịch sử sau trong Gara.',
      exitConfirm: 'Thoát thiết lập',
      bike: {
        title: 'Thêm xe của bạn',
        body: 'Cho chúng tôi biết thông tin cơ bản: dòng xe, biển số và số ODO hiện tại.',
        why: 'Đây là nền tảng cho trang chủ và nhắc nhở của bạn.',
      },
      oil: {
        title: 'Lần thay nhớt gần nhất',
        body: 'Bạn đã thay nhớt máy lần cuối khi nào? Bỏ qua nếu không chắc chắn.',
        why: 'Chúng tôi sẽ dùng thông tin này để bắt đầu lịch bảo dưỡng của bạn.',
        dateLabel: 'Ngày thay nhớt gần nhất',
        odoLabel: 'Số ODO lúc đó (km, không bắt buộc)',
        save: 'Lưu lần thay nhớt',
        saved: 'Đã ghi nhận lần thay nhớt.',
      },
      done: {
        title: 'Bạn đã sẵn sàng',
        body: 'Gara của bạn đã sẵn sàng. Điểm đến tiếp theo: trang chủ.',
        cta: 'Đến trang chủ',
      },
    },
  },
  tutorial: {
    common: {
      next: 'Tiếp theo',
      back: 'Quay lại',
      done: 'Xong',
      skip: 'Bỏ qua hướng dẫn',
      closeA11y: 'Đóng hướng dẫn',
      stepOf: 'Bước {current}/{total}',
      tryIt: 'Thử ngay: chạm vào mục được đánh dấu.',
      tryItLong: 'Thử ngay: nhấn giữ mục được đánh dấu.',
      tryItNavigate: 'Thử ngay. Hướng dẫn sẽ tiếp tục ở màn hình kế tiếp.',
      tryItSave: 'Thử ngay. Hướng dẫn sẽ tiếp tục sau khi bạn lưu.',
    },
    offer: {
      title: 'Bạn có muốn xem hướng dẫn nhanh không?',
      body: 'Khoảng 3 phút, có thể bỏ qua bất cứ lúc nào. Bạn cũng có thể xem lại sau trong Cài đặt.',
      start: 'Bắt đầu hướng dẫn',
      later: 'Để sau',
      never: 'Không hiện lại nữa',
    },
    resume: {
      title: 'Tiếp tục hướng dẫn?',
      body: 'Bạn đã dừng hướng dẫn giữa chừng.',
      resume: 'Tiếp tục',
      restart: 'Bắt đầu lại',
      dismiss: 'Để sau',
    },
  },
  help: {
    title: 'Trợ giúp & Hướng dẫn',
    toursSection: 'Hướng dẫn từng bước',
    articlesSection: 'Bài hướng dẫn',
    optionsSection: 'Tùy chọn',
    status: {
      completed: 'Đã hoàn tất',
      inProgress: 'Đang thực hiện',
      skipped: 'Đã bỏ qua',
      notStarted: 'Chưa bắt đầu',
    },
    replayA11y: 'Xem lại {title}',
    tutorialMode: 'Chế độ hướng dẫn',
    tutorialModeCaption: 'Hiện lại tất cả mẹo và gợi ý theo ngữ cảnh. Dữ liệu của bạn không bị ảnh hưởng.',
    showOfferAgain: 'Hiện lại lời mời xem hướng dẫn',
    resetProgress: 'Đặt lại tiến trình hướng dẫn',
    resetTitle: 'Đặt lại tiến trình hướng dẫn?',
    resetBody:
      'Các hướng dẫn, mẹo và bước giới thiệu sẽ được đánh dấu là chưa xem. Xe, bảo dưỡng, xăng, chi tiêu và giấy tờ không bị ảnh hưởng.',
    resetConfirm: 'Đặt lại tiến trình',
    maintenanceDates: {
      rowTitle: 'Cách theo dõi ngày bảo dưỡng',
      title: 'Cách theo dõi ngày bảo dưỡng',
      whenTitle: 'Khi nào nên ghi bảo dưỡng',
      whenBody:
        'Ghi lại việc bảo dưỡng ngay khi vừa hoàn thành, như thay nhớt hoặc thay má phanh mới. Tolits sẽ dùng ngày và số ODO đó để lên kế hoạch cho lần tiếp theo.',
      datesTitle: 'Ngày tháng hoạt động như thế nào',
      datesBody:
        'Mỗi bộ phận ghi nhớ ngày bảo dưỡng gần nhất. Bạn có thể cập nhật bất cứ lúc nào từ màn hình bộ phận trong mục Bảo dưỡng, không cần thiết lập ngay từ đầu.',
      intervalsTitle: 'Chu kỳ theo số ODO hoạt động như thế nào',
      intervalsBody:
        'Mỗi bộ phận có chu kỳ khuyến nghị, theo km, theo tháng, hoặc cả hai. Tolits tính từ lần ghi gần nhất để ước tính khi nào đến hạn tiếp theo.',
      remindersTitle: 'Nhắc nhở sử dụng thông tin này như thế nào',
      remindersBody:
        'Khi một bộ phận sắp đến hạn hoặc quá hạn, Tolits sẽ hiển thị trên trang chủ và có thể gửi nhắc nhở. Cập nhật số ODO thường xuyên giúp các ước tính này chính xác hơn.',
    },
  },
};
