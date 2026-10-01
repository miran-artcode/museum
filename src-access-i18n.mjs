/* ============================================================
   학습 지원: 화면 문구의 도움 언어 번역 (2026-09-28)
   ------------------------------------------------------------
   · 한국어 화면은 그대로 두고, 도움 언어를 고른 학생에게는 학습 지원 창의 이름표 아래와
     「화면 용어」 목록, 입장 화면의 안내에 그 언어를 함께 보인다(원문을 바꾸지 않는 이중 표기).
   · 입장 안내(GATE_HELP)는 로그인 전에 필요하므로 로그인 없이 읽힌다.
   · 번역은 초안이다. 학교의 이중언어강사나 해당 언어 사용자가 검토한 뒤 고친다(설계서 §5.4).
   ============================================================ */

export const I18N_LANGS = ["en", "zh", "vi", "ru", "ja"];

/* 입장 화면 안내. steps의 「」 안 한국어는 화면에 보이는 글자 그대로 둔다(학생이 화면에서 찾을 수 있게) */
export const GATE_HELP = {
  en: {
    btn: "English",
    title: "How to enter",
    steps: [
      "Choose 「학생」 (Student).",
      "「학번」: your student number, digits only (e.g. 10203).",
      "「별명」: a nickname, only the first time. Do not use your real name.",
      "「비밀번호」: 4 digits. Choose them the first time and remember them.",
      "Press 「기록실 입장」 (Enter).",
      "Inside, press 「학습 지원」 at the top to choose your language, larger text, read-aloud and captions.",
    ],
    forgot: "If you forget your password, ask your teacher.",
  },
  zh: {
    btn: "中文",
    title: "如何进入",
    steps: [
      "选择「학생」（学生）。",
      "「학번」：学号，只输入数字（例如 10203）。",
      "「별명」：昵称，只在第一次进入时填写。不要使用真实姓名。",
      "「비밀번호」：4位数字密码。第一次进入时自己设定，并请记住。",
      "点击「기록실 입장」（进入）。",
      "进入后，点击上方的「학습 지원」（学习支持），可以选择语言、放大文字、朗读和字幕。",
    ],
    forgot: "如果忘记密码，请告诉老师。",
  },
  vi: {
    btn: "Tiếng Việt",
    title: "Cách đăng nhập",
    steps: [
      "Chọn 「학생」 (Học sinh).",
      "「학번」: mã số học sinh, chỉ nhập chữ số (ví dụ 10203).",
      "「별명」: biệt danh, chỉ nhập lần đầu. Không dùng tên thật.",
      "「비밀번호」: mật khẩu 4 chữ số. Tự đặt ở lần đầu và hãy ghi nhớ.",
      "Nhấn 「기록실 입장」 (Vào).",
      "Sau khi vào, nhấn 「학습 지원」 (Hỗ trợ học tập) ở phía trên để chọn ngôn ngữ, chữ lớn, đọc to và phụ đề.",
    ],
    forgot: "Nếu quên mật khẩu, hãy báo cho giáo viên.",
  },
  ru: {
    btn: "Русский",
    title: "Как войти",
    steps: [
      "Выберите 「학생」 (Ученик).",
      "「학번」: номер ученика, только цифры (например, 10203).",
      "「별명」: псевдоним, только при первом входе. Не пишите настоящее имя.",
      "「비밀번호」: пароль из 4 цифр. Придумайте его при первом входе и запомните.",
      "Нажмите 「기록실 입장」 (Войти).",
      "После входа нажмите 「학습 지원」 (Помощь в учёбе) вверху: там можно выбрать язык, крупный шрифт, чтение вслух и субтитры.",
    ],
    forgot: "Если вы забыли пароль, скажите учителю.",
  },
  ja: {
    btn: "日本語",
    title: "入り方",
    steps: [
      "「학생」（生徒）を選びます。",
      "「학번」：学籍番号を数字だけで入力します（例：10203）。",
      "「별명」：ニックネーム。最初の一回だけ入力します。本名は使いません。",
      "「비밀번호」：数字4桁のパスワード。最初に自分で決めて、覚えておきます。",
      "「기록실 입장」（入室）を押します。",
      "入ったら、上の「학습 지원」（学習サポート）を押すと、言語・文字の大きさ・読み上げ・字幕を選べます。",
    ],
    forgot: "パスワードを忘れたら、先生に伝えてください。",
  },
};

/* 학습 지원 창의 이름표. ko는 화면의 한국어 그대로 */
const K = {
  panel: ["학습 지원", { en: "Learning support", zh: "学习支持", vi: "Hỗ trợ học tập", ru: "Помощь в учёбе", ja: "学習サポート" }],
  presets: ["한 번에 켜기", { en: "Quick sets", zh: "一键设置", vi: "Bật nhanh", ru: "Быстрые наборы", ja: "まとめて設定" }],
  view: ["보기", { en: "Display", zh: "显示", vi: "Hiển thị", ru: "Экран", ja: "表示" }],
  listen: ["듣기", { en: "Listening", zh: "听", vi: "Nghe", ru: "Слушать", ja: "聞く" }],
  lang: ["언어", { en: "Language", zh: "语言", vi: "Ngôn ngữ", ru: "Язык", ja: "言語" }],
  words: ["글로 보기", { en: "Text instead of sound", zh: "用文字看", vi: "Xem bằng chữ", ru: "Текст вместо звука", ja: "文字で見る" }],
  input: ["입력", { en: "Typing", zh: "输入", vi: "Nhập", ru: "Ввод", ja: "入力" }],
  text: ["글자 크기", { en: "Text size", zh: "文字大小", vi: "Cỡ chữ", ru: "Размер текста", ja: "文字の大きさ" }],
  spacing: ["줄·글자 간격 넓게", { en: "Wider line and letter spacing", zh: "加大行距和字距", vi: "Giãn dòng và giãn chữ", ru: "Шире интервалы", ja: "行間・字間を広く" }],
  contrast: ["대비", { en: "Contrast", zh: "对比度", vi: "Độ tương phản", ru: "Контраст", ja: "コントラスト" }],
  cNone: ["기본", { en: "Default", zh: "默认", vi: "Mặc định", ru: "Обычный", ja: "標準" }],
  cHigh: ["고대비", { en: "High contrast", zh: "高对比度", vi: "Tương phản cao", ru: "Высокий контраст", ja: "高コントラスト" }],
  cDark: ["어두운 화면", { en: "Dark", zh: "深色", vi: "Nền tối", ru: "Тёмный", ja: "ダーク" }],
  motion: ["움직임 줄이기", { en: "Reduce motion", zh: "减少动画", vi: "Giảm chuyển động", ru: "Меньше анимации", ja: "動きを減らす" }],
  targets: ["버튼·입력칸 크게", { en: "Larger buttons and fields", zh: "放大按钮和输入框", vi: "Nút và ô nhập lớn hơn", ru: "Крупные кнопки и поля", ja: "ボタン・入力欄を大きく" }],
  underline: ["링크에 밑줄", { en: "Underline links", zh: "链接加下划线", vi: "Gạch chân liên kết", ru: "Подчёркивать ссылки", ja: "リンクに下線" }],
  tts: ["읽어 주기 버튼 보이기", { en: "Show read-aloud buttons", zh: "显示朗读按钮", vi: "Hiện nút đọc to", ru: "Показать кнопки чтения вслух", ja: "読み上げボタンを表示" }],
  rate: ["읽는 빠르기", { en: "Reading speed", zh: "朗读速度", vi: "Tốc độ đọc", ru: "Скорость чтения", ja: "読む速さ" }],
  voice: ["목소리", { en: "Voice", zh: "声音", vi: "Giọng đọc", ru: "Голос", ja: "声" }],
  test: ["들어 보기", { en: "Try", zh: "试听", vi: "Nghe thử", ru: "Прослушать", ja: "試しに聞く" }],
  descOpen: ["작품 설명 늘 펼치기", { en: "Always open artwork descriptions", zh: "总是展开作品说明", vi: "Luôn mở mô tả tác phẩm", ru: "Всегда раскрывать описания работ", ja: "作品説明をいつも開く" }],
  helpLang: ["도움 언어", { en: "My language", zh: "我的语言", vi: "Ngôn ngữ của tôi", ru: "Мой язык", ja: "わたしの言語" }],
  none: ["쓰지 않음", { en: "None", zh: "不使用", vi: "Không dùng", ru: "Не использовать", ja: "使わない" }],
  bilingual: ["읽기 자료를 펼치면 번역 함께 보기", { en: "Show translation under the Korean text", zh: "在韩文下面显示翻译", vi: "Hiện bản dịch dưới văn bản tiếng Hàn", ru: "Показывать перевод под корейским текстом", ja: "韓国語の下に翻訳を表示" }],
  cap: ["실시간 자막 받기", { en: "Live captions", zh: "实时字幕", vi: "Phụ đề trực tiếp", ru: "Живые субтитры", ja: "リアルタイム字幕" }],
  capSize: ["자막 크기", { en: "Caption size", zh: "字幕大小", vi: "Cỡ phụ đề", ru: "Размер субтитров", ja: "字幕の大きさ" }],
  easy: ["쉬운 말 요약 먼저 보기", { en: "Easy Korean summary first", zh: "先看简单韩语摘要", vi: "Xem tóm tắt tiếng Hàn dễ trước", ru: "Сначала краткое изложение простым корейским", ja: "やさしい韓国語の要約を先に" }],
  gloss: ["본문에 핵심 용어 표시", { en: "Mark key terms in the text", zh: "在正文中标出关键词", vi: "Đánh dấu thuật ngữ chính", ru: "Отмечать ключевые термины", ja: "本文のキーワードに印" }],
  alt: ["다른 감각으로 하는 관찰 보기", { en: "Observation with other senses", zh: "用其他感官观察", vi: "Quan sát bằng giác quan khác", ru: "Наблюдение другими чувствами", ja: "ほかの感覚で観察" }],
  dict: ["말로 입력 버튼 보이기", { en: "Show voice typing button", zh: "显示语音输入按钮", vi: "Hiện nút nhập bằng giọng nói", ru: "Показать кнопку голосового ввода", ja: "音声入力ボタンを表示" }],
  reset: ["모두 기본값으로", { en: "Reset all", zh: "全部恢复默认", vi: "Đặt lại tất cả", ru: "Сбросить всё", ja: "すべて元に戻す" }],
  close: ["닫기", { en: "Close", zh: "关闭", vi: "Đóng", ru: "Закрыть", ja: "閉じる" }],
  uiWords: ["화면 용어", { en: "Words on the screen", zh: "界面用语", vi: "Từ trên màn hình", ru: "Слова на экране", ja: "画面のことば" }],
  rec: ["선생님 추천", { en: "Suggested by your teacher", zh: "老师推荐", vi: "Giáo viên gợi ý", ru: "Совет учителя", ja: "先生のおすすめ" }],
  apply: ["적용", { en: "Apply", zh: "应用", vi: "Áp dụng", ru: "Применить", ja: "適用" }],
  read: ["읽어 주기", { en: "Read aloud", zh: "朗读", vi: "Đọc to", ru: "Читать вслух", ja: "読み上げ" }],
  stop: ["멈추기", { en: "Stop", zh: "停止", vi: "Dừng", ru: "Стоп", ja: "止める" }],
  trOn: ["번역 함께 보기", { en: "Show translation", zh: "显示翻译", vi: "Xem bản dịch", ru: "Показать перевод", ja: "翻訳を表示" }],
  trOff: ["번역 숨기기", { en: "Hide translation", zh: "隐藏翻译", vi: "Ẩn bản dịch", ru: "Скрыть перевод", ja: "翻訳を隠す" }],
  easyT: ["쉬운 말로 먼저 보기", { en: "In easy Korean", zh: "简单韩语", vi: "Bằng tiếng Hàn dễ", ru: "Простым корейским", ja: "やさしい韓国語で" }],
  terms: ["이번 차시 핵심 용어", { en: "Key terms of this lesson", zh: "本课关键词", vi: "Thuật ngữ chính của bài", ru: "Ключевые термины урока", ja: "この時間のキーワード" }],
  sign: ["한국수어사전", { en: "Korean Sign Language dictionary", zh: "韩国手语词典", vi: "Từ điển ngôn ngữ ký hiệu Hàn Quốc", ru: "Словарь корейского жестового языка", ja: "韓国手話辞典" }],
  capHist: ["자막 기록", { en: "Caption history", zh: "字幕记录", vi: "Lịch sử phụ đề", ru: "История субтитров", ja: "字幕の記録" }],
  memo: ["내 언어 메모", { en: "Notes in my language", zh: "用我的语言做笔记", vi: "Ghi chú bằng tiếng của tôi", ru: "Заметки на моём языке", ja: "自分の言語でメモ" }],
  desc: ["작품 설명", { en: "Artwork description", zh: "作品说明", vi: "Mô tả tác phẩm", ru: "Описание работы", ja: "作品の説明" }],
  descTts: ["설명 듣기", { en: "Listen", zh: "听说明", vi: "Nghe mô tả", ru: "Слушать", ja: "説明を聞く" }],
  sel: ["고른 글 읽기", { en: "Read selected text", zh: "朗读选中文字", vi: "Đọc đoạn đã chọn", ru: "Читать выделенное", ja: "選んだ文を読む" }],
  dictOn: ["말로 입력", { en: "Voice typing", zh: "语音输入", vi: "Nhập bằng giọng nói", ru: "Голосовой ввод", ja: "音声入力" }],
  dictOff: ["입력 멈추기", { en: "Stop voice typing", zh: "停止语音输入", vi: "Dừng nhập giọng nói", ru: "Остановить ввод", ja: "音声入力を止める" }],
};

/* 이름표 한 개: { ko, tr } — tr은 도움 언어가 없거나 번역이 없으면 빈 값 */
export function label(key, lang) {
  const e = K[key];
  if (!e) return { ko: key, tr: "" };
  return { ko: e[0], tr: (lang && e[1][lang]) || "" };
}

/* 화면 용어: 학생 화면에서 자주 보는 한국어 단어와 도움 언어의 뜻 */
export const UI_WORDS = [
  ["강의 노트", { en: "Lecture notes", zh: "讲义", vi: "Bài giảng", ru: "Конспект урока", ja: "講義ノート" }],
  ["읽기 자료", { en: "Readings", zh: "阅读材料", vi: "Tài liệu đọc", ru: "Материалы для чтения", ja: "読み物" }],
  ["모두 펼치기", { en: "Open all", zh: "全部展开", vi: "Mở tất cả", ru: "Раскрыть всё", ja: "すべて開く" }],
  ["생각해 볼 질문", { en: "Questions to think about", zh: "思考题", vi: "Câu hỏi suy nghĩ", ru: "Вопросы для размышления", ja: "考えてみる質問" }],
  ["배움 확인", { en: "Learning check", zh: "学习确认", vi: "Kiểm tra bài học", ru: "Проверка понимания", ja: "学びの確認" }],
  ["탐구 질문", { en: "Inquiry question", zh: "探究问题", vi: "Câu hỏi tìm hiểu", ru: "Исследовательский вопрос", ja: "探究の質問" }],
  ["답 저장", { en: "Save answer", zh: "保存答案", vi: "Lưu câu trả lời", ru: "Сохранить ответ", ja: "答えを保存" }],
  ["추가 질문", { en: "Follow-up question", zh: "追加问题", vi: "Câu hỏi thêm", ru: "Дополнительный вопрос", ja: "追加の質問" }],
  ["저장됨", { en: "Saved", zh: "已保存", vi: "Đã lưu", ru: "Сохранено", ja: "保存済み" }],
  ["입력 중", { en: "Typing", zh: "正在输入", vi: "Đang nhập", ru: "Ввод", ja: "入力中" }],
  ["차시", { en: "Lesson (class period)", zh: "课时", vi: "Tiết học", ru: "Урок", ja: "時限（授業回）" }],
  ["잠김", { en: "Locked (not open yet)", zh: "锁定（未开放）", vi: "Đã khóa (chưa mở)", ru: "Закрыто (ещё не открыто)", ja: "ロック（まだ開いていない）" }],
  ["한 주 과제", { en: "One-week assignment", zh: "一周作业", vi: "Bài tập một tuần", ru: "Задание на неделю", ja: "一週間の課題" }],
  ["유물 발상 단계", { en: "Artifact idea steps", zh: "文物构思步骤", vi: "Các bước lên ý tưởng hiện vật", ru: "Шаги замысла артефакта", ja: "遺物の発想ステップ" }],
  ["작품 캡션", { en: "Artwork label (caption)", zh: "作品标签", vi: "Nhãn tác phẩm", ru: "Этикетка работы", ja: "作品キャプション" }],
  ["전시장", { en: "Exhibition hall", zh: "展厅", vi: "Phòng triển lãm", ru: "Выставочный зал", ja: "展示室" }],
  ["최종 평가", { en: "Final assessment", zh: "最终评价", vi: "Đánh giá cuối", ru: "Итоговая оценка", ja: "最終評価" }],
  ["쪽지시험", { en: "Quiz", zh: "小测验", vi: "Bài kiểm tra ngắn", ru: "Короткий тест", ja: "小テスト" }],
  ["나가기", { en: "Log out", zh: "退出", vi: "Thoát", ru: "Выйти", ja: "退出" }],
  ["사진 올리기", { en: "Upload a photo", zh: "上传照片", vi: "Tải ảnh lên", ru: "Загрузить фото", ja: "写真をアップロード" }],
  ["녹음 시작", { en: "Start recording", zh: "开始录音", vi: "Bắt đầu ghi âm", ru: "Начать запись", ja: "録音開始" }],
];
