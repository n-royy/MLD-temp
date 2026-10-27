# Nhật ký cải tiến harness MLD

Mỗi lần chạy practice là một vòng lặp. Mỗi vòng ghi theo cùng một khung bốn phần:
**1. Kết quả lần trước và nhược điểm · 2. Thay đổi và kết quả · 3. Thảo luận · 4. Cải thiện tiếp theo.**
Số liệu lấy từ `doc/practice-<ID>/` (progress log, session Codex, repo đội). Điểm chính thức của Grader
chưa hiển thị cho đội ở cả hai trận, nên "kết quả" dưới đây là kết quả phía đội.

---

## Vòng 1 → Vòng 2: QNW5V6OU (18:12–19:17) → VREGZAVG (21:33–22:35), 26/10/2026

Cùng đề (Solova, 3 wave, 5 item: BUG-01, BUG-02, CR-01, TASK-02, TASK-01), cùng cấu hình
agent-test-0 (`gpt-6.1-sol`, effort low, một agent). Vòng 2 chạy pack v1.0.0 đã sửa.

### 1. Kết quả vòng 1 (QNW5V6OU) và nhược điểm

| Chỉ số | Giá trị |
|---|---|
| Item nộp / receipt ACCEPTED | 5 / 5 |
| Bị block, vào máy, restart | 0 |
| Bài sai submit schema | **2 / 5** (BUG-02, TASK-02): evidence ghi chuỗi thay vì mảng |
| Test có sẵn bị sửa | **1** (`tests/cascade.test.ts`, BUG-02) |
| Tra web ngoài origin cho phép | **1 lần** (TASK-02, GitHub Advisories) |
| Script phụ commit vào `src/` | 4 item |
| Token session chính | 22,8M input (99,4% cache), 38k output; **48% tiêu lúc chỉ chờ** |
| Token guardian (Codex tự duyệt quyền) | 9,8M input (bỏ sót trong báo cáo vòng 1, bổ sung sau) |

Nhược điểm chính:
- **Đóng gói answer sai schema** ở 2 bài. Luật trên trang match: bài không validate được thì 0 điểm, nên có
  nguy cơ mất 400/1000 điểm dù code đúng. Nguyên nhân: ghi JSON bằng PowerShell `ConvertTo-Json` làm mảng một
  phần tử thành chuỗi, và chỉ kiểm schema *sau* khi đã nộp.
- **Sửa test có sẵn cho xanh** thay vì sửa code (test cascade), trái với yêu cầu của đề.
- **Tra web** ngoài các origin khai báo.
- **Chờ ồn ào**: mỗi phút một lượt kèm thông báo, mỗi lượt gửi lại toàn bộ ngữ cảnh.
- Kiểm tra lại bài sau khi nộp (vô ích vì đã nộp xong).

### 2. Thay đổi ở vòng 2 và kết quả

Thay đổi trong pack (helper + config + skill), kèm memory tĩnh:

| # | Thay đổi | Ở đâu |
|---|---|---|
| 1 | `submit_work` kiểm answer theo `challenge/<ID>-submit.schema.json` trên đúng revision; sai thì từ chối gửi. Thêm tool `validate_answer` để kiểm trước khi commit | `src/schema.mjs`, `src/runtime-session.mjs` |
| 2 | Ghi `submit.json` bằng `apply_patch`/Node, cấm `ConvertTo-Json` | skill |
| 3 | `submit_work` chặn khi test có sẵn bị sửa/xóa (`EXISTING_TESTS_MODIFIED`), trừ khi có lý do ghi rõ | helper + skill |
| 4 | `web_search = "disabled"` | `config/codex.toml` |
| 5 | `wait_for_update` chờ tới 4 phút/lượt, agent im lặng khi chờ, không kiểm lại bài đã nộp | helper + config + skill |
| 6 | Script phụ vào `.mtm-tmp/` (git-ignored), chặn nếu lỡ commit | helper + skill |
| 7 | Memory tĩnh: `LESSONS.md` (bài học) và `products/solova.md` (ghi chú sản phẩm) | skills |

Kết quả vòng 2 (VREGZAVG), so với vòng 1:

| Chỉ số | Vòng 1 | Vòng 2 | Nhận xét |
|---|---|---|---|
| Item nộp / ACCEPTED | 5/5 | 5/5 | |
| Bài sai schema | 2 | **0** | gate hoạt động |
| Test có sẵn bị sửa | 1 | **0** | |
| Tra web | 1 | **0** | |
| Script phụ trong `src/` | có | **0** | |
| Thời gian mở→nộp: BUG-02 / BUG-01 / CR-01 / TASK-02 / TASK-01 | 6,9 / 13,1 / 3,6 / 7,5 / 1,5′ | 4,4 / 10,5 / 3,3 / 6,8 / 1,1′ | nhanh hơn, một phần vì quen đề |
| Token session chính | 22,8M | **15,7M (−31%)** | |
| Token lúc chờ hết trận (session chính) | 10,9M | **4,2M (−61%)** | |
| Token guardian | 9,8M | 10,6M | không đổi, giờ chiếm ~40% |
| Lệnh gọi Game Master thất bại / retry / restart | 0 | 0 | |
| Status bài nộp | 5 DONE | **5 PARTIAL** | xem thảo luận |
| Kịch bản tự báo FAIL | 0 | 2 (BUG-02 TC-04, TASK-02 TC-04) | do test cascade có sẵn |

### 3. Thảo luận

- **Các thay đổi về quy trình đều có hiệu lực** và không phụ thuộc vào việc quen đề: 0 bài sai schema, 0 test bị
  làm yếu, 0 tra web, token chờ giảm 61%. Đây là phần cải thiện chắc chắn.
- **Tốc độ nhanh hơn chỉ một phần nhờ pack.** Hai trận cùng đề nên agent có lợi thế quen code. Không tính tốc
  độ là thành quả của pack cho tới khi gặp đề khác.
- **Test cascade là bẫy cài sẵn trong đề**, và hai vòng xử lý theo hai hướng đều chưa đúng:
  - Tài liệu thiết kế trong repo (`DECISIONS.md`, `BUILD_REPORT.md`) ghi hóa đơn/thanh toán dùng `RESTRICT`
    ("fails loudly instead of destroying history"), còn migration `20260702093140_company_delete_cascades_financials`
    đổi sang `CASCADE`. Test đúng, code sai.
  - Vòng 1 sửa test cho xanh (sai hướng). Vòng 2 giữ test nhưng không sửa code, nên 4/5 item có tiêu chí
    "existing tests pass" (BUG-01, BUG-02, CR-01, TASK-02) không đạt tiêu chí đó. Agent khai FAIL/PARTIAL là
    **trung thực và đúng theo tiêu chí**, nhưng điểm có thể mất ở 4 item vì một lỗi nền chưa được xử lý.
  - Bài học: quy tắc "không sửa test" cần đi kèm bước điều tra *vì sao* test có sẵn fail và sửa code khi code
    lệch khỏi thiết kế. Việc này nên làm sớm, ngay item đầu tiên có tiêu chí đó, thậm chí ghi nhận từ lúc chuẩn bị.
- **Chi phí còn lại nằm ở guardian.** Với "Approve for me", Codex tự duyệt từng lệnh gọi tool; 108/110 lượt duyệt
  của vòng 2 là cho tool `mtm_helper` của chính đội (kể cả các lượt chờ). Giảm được phần này là giảm thêm khoảng
  một phần ba tổng token. Có thể đặt `default_tools_approval_mode = "approve"` cho riêng `mtm_helper` (Codex
  nhận giá trị này), nhưng việc duyệt là cơ chế của Player, nên **chưa áp dụng cho tới khi hỏi BTC**.
- **Hạn chế của việc đánh giá:** chưa có điểm Grader cho cả hai trận. Mọi so sánh trên là phía đội.

### 4. Cải thiện tiếp theo (áp dụng cho vòng 3)

| # | Việc | Trạng thái |
|---|---|---|
| 1 | Quy trình xử lý test có sẵn fail: điều tra bằng tài liệu thiết kế trong repo, sửa code khi code lệch thiết kế, làm ở item đầu tiên có tiêu chí "existing tests pass", ghi rõ trong engineering record | áp dụng |
| 2 | Status theo đúng tiêu chí của item; sau khi xử lý lỗi nền thì các item không còn bị kéo xuống PARTIAL | áp dụng |
| 3 | Guardian: `default_tools_approval_mode = "approve"` cho riêng `mtm_helper` (tool của đội tự kiểm phạm vi; lệnh shell vẫn qua duyệt). Rà tài liệu BTC: không có yêu cầu nào bắt duyệt từng lệnh gọi tool, chỉ cấm sửa Player để né duyệt; đây là config Codex của đội | áp dụng (pack 1.2.0) |
| 4 | Ghi chú Solova: cascade RESTRICT theo thiết kế; cách kiểm layout nhanh (BUG-01 tốn nhất ở cả hai vòng) | áp dụng |
| 5 | Ít lệnh gọi helper hơn: `start_work` trả luôn đề đầy đủ và tự ghi `BACKLOG_TESTS NOT_RUN`; `submit_work` nhận số liệu test, tự ghi `BACKLOG_TESTS` cuối và trả board mới. Bỏ được `get_backlog_item`, `refresh_match` sau nộp và 2–3 lần `report_progress` mỗi item (ước tính −20 đến −25 lượt/trận) | áp dụng (pack 1.2.0) |
| 6 | Ngữ cảnh gọn hơn: `tool_output_token_limit = 2500`, `model_verbosity = "low"`, `model_reasoning_summary = "none"` (bộ "lean" của benchmark đội) | áp dụng (pack 1.2.0) |
| 7 | Chạy vòng 3 với đề *khác* nếu có, để tách tác dụng của pack khỏi việc quen đề | khi BTC có đề mới |

Mục tiêu đo ở vòng 3: token guardian (kỳ vọng từ 10,6M xuống gần 0), số lượt duyệt, số lệnh gọi helper, và
tổng token hai phiên (vòng 2: 26,3M).

---

## Vòng 2 → Vòng 3: VREGZAVG (21:33–22:35) → CTG2YCRL (23:21–00:24), 26–27/10/2026

Cùng đề Solova lần thứ ba. Vòng 3 chạy pack 1.2.0 (A: tool của đội không qua guardian; B: gộp lệnh gọi helper;
C: config gọn; quy trình xử lý test baseline). Tài khoản Codex: ChatGPT Plus cá nhân.

### 1. Kết quả vòng 2 (VREGZAVG) và nhược điểm

| Chỉ số | Giá trị |
|---|---|
| Item nộp / ACCEPTED | 5 / 5, nhưng **5/5 PARTIAL** |
| Bài sai schema / test bị sửa / tra web | 0 / 0 / 0 |
| Token session chính / guardian | 15,7M / **10,6M** (guardian ≈ 40% tổng 26,3M) |
| Lượt guardian duyệt | **110**, trong đó 108 cho tool `mtm_helper` của chính đội |
| Lệnh gọi helper | ≈108 (nhiều `get_backlog_item`, `refresh_match`, `report_progress` trùng lặp) |

Nhược điểm chính:
- **Test cascade cài sẵn chưa được xử lý** → 4/5 item mất tiêu chí "existing tests pass", mọi item PARTIAL.
- **Guardian duyệt tool của chính đội** → tốn ~40% token, không mang lại kiểm soát gì thêm (tool đã tự kiểm phạm vi).
- Gọi helper nhiều lần không cần thiết (mỗi lần = một lượt model ở cả hai phiên).

### 2. Thay đổi ở vòng 3 và kết quả

| # | Thay đổi | Ở đâu |
|---|---|---|
| 1 | Quy trình "Baseline failures": điều tra test fail sẵn bằng tài liệu thiết kế, sửa code (migration mới) khi code lệch thiết kế, làm ở item đầu tiên có tiêu chí test | skill + LESSONS + solova.md |
| 2 | Status theo đúng tiêu chí của item | skill |
| 3 | `default_tools_approval_mode = "approve"` cho `mtm_helper` | config |
| 4 | `start_work` trả đề đầy đủ + tự ghi `BACKLOG_TESTS NOT_RUN`; `submit_work` nhận số liệu test, ghi `BACKLOG_TESTS` cuối, trả board | helper + skill |
| 5 | `tool_output_token_limit = 2500`, `model_verbosity = "low"`, `model_reasoning_summary = "none"` | config |

Kết quả vòng 3 (CTG2YCRL), so với vòng 2:

| Chỉ số | Vòng 2 | Vòng 3 | Nhận xét |
|---|---|---|---|
| Item nộp / ACCEPTED | 5/5 | **3/5** (BUG-02, BUG-01, TASK-02) | agent chết lúc 23:42, xem thảo luận |
| Status bài nộp | 5 PARTIAL | **3 DONE** | lỗi baseline đã được xử lý |
| Test cascade | giữ nguyên, fail | **sửa đúng**: migration `20261026163000_restore_financial_history_restrict` trả khóa ngoại về RESTRICT, 12/12 test có sẵn pass | theo đúng quy trình mới, không đụng test |
| Bài sai schema / test bị sửa / tra web / script phụ trong src | 0 | 0 | giữ được |
| Lượt guardian duyệt | 110 | **1** | A có hiệu lực |
| Token guardian | 10,6M | **0,02M** | |
| Token session chính (chuẩn bị → nộp TASK-02, 21 phút, 3 item) | 15,7M cho 5 item, 62 phút | 8,6M | so theo item: BUG-02 1,36M (trước 1,24M), BUG-01 3,31M (3,02M), TASK-02 2,28M (1,92M) |
| Lệnh gọi helper | ≈108 | **38** cho 3,x item (`report_progress` vẫn 11, `refresh_match` 3) | giảm mạnh; vẫn còn gọi thừa |
| Thời gian mở→nộp: BUG-02 / BUG-01 / TASK-02 | 4,4 / 10,5 / ≈6,8′ | 4,9 / 11,8 / 4,1′ | ngang nhau; BUG-02 lâu hơn vì kiêm sửa cascade |
| Chuẩn bị | 3,2′ | 2,6′ | agent tự chẩn đoán test fail ngay lúc chuẩn bị |
| Lỗi mới | – | 2 (xem dưới) | |

Hai lỗi mới ở vòng 3:
- **Hết hạn mức tài khoản Codex Plus lúc 23:42:16**, ngay sau khi nộp TASK-02 và Start Work CR-01. Từ đó mọi lượt
  đều kết thúc tức thì với "You've hit your usage limit"; Player tự gửi RESUME_GAME mỗi 10 phút (6 đợt, 105 lượt
  lỗi) cho đến hết trận. CR-01 (300đ) và TASK-01 (100đ) không được làm. Nguyên nhân là tài khoản, không phải pack.
- **Helper bỏ sót `DISCOVERED` ở wave 1**: agent gọi `refresh_match` trước khi `configure_session` với descriptor
  START_GAME, nên lúc refresh helper còn ở phase chuẩn bị và không ghi DISCOVERED; `start_work` sau đó cũng không
  ghi bù. BUG-01 chỉ được DISCOVERED khi `submit_work` trả board. Đã sửa ở pack 1.2.1: mọi lần đọc trận trong
  phase GAME và `start_work` đều ghi DISCOVERED cho item mới; có mock test.

### 3. Thảo luận

- **Ba mục A/B/C đều có hiệu lực và đo được:** guardian từ 110 lượt xuống 1, token guardian từ 10,6M xuống gần 0;
  lệnh gọi helper giảm khoảng 60%; token theo từng item không tăng đáng kể dù vòng 3 làm thêm việc sửa cascade.
  Token mỗi item không giảm nhiều vì phần lớn input là cache của chính transcript; muốn giảm nữa phải rút ngắn
  transcript (ít lượt hơn, output ngắn hơn), không phải tắt thêm thứ gì.
- **Quy trình test baseline đúng như kỳ vọng:** agent nhận ra "migration uses CASCADE contrary to design" ngay lúc
  chuẩn bị, sửa bằng migration mới ở BUG-02, cả ba bài đều DONE với tiêu chí test đạt. Đây là thay đổi về điểm lớn
  nhất của vòng này (vòng 2 có nguy cơ mất tiêu chí ở 4 item).
- **Hạn mức tài khoản là rủi ro vận hành số một**, không phải rủi ro kỹ thuật. Ba trận practice trong một buổi tối
  trên một tài khoản Plus là quá nhiều. Trận chính thức phải dùng tài khoản $50 của BTC hoặc gói có hạn mức cao, và
  nên có tài khoản dự phòng đã đăng nhập sẵn để đổi khi cần (luật cho phép đổi tài khoản không trừ điểm).
- **Player không nhận ra agent chết vì lỗi model:** nó chỉ thấy lượt kết thúc và gửi RESUME mỗi 10 phút. Pack không
  can thiệp được vào chỗ này; chỉ có người đổi tài khoản mới cứu được.
- **Vẫn chưa có điểm Grader** cho cả ba trận; mọi so sánh là phía đội.

### 4. Cải thiện tiếp theo (cho vòng 4)

| # | Việc | Trạng thái |
|---|---|---|
| 1 | Sửa helper ghi DISCOVERED ở mọi lần đọc trận trong phase GAME và ở `start_work` | áp dụng (pack 1.2.1) |
| 2 | Vận hành: tài khoản Codex có hạn mức đủ cho 60 phút (tài khoản BTC hoặc Pro); tài khoản dự phòng; kiểm hạn mức trước khi Initialize | quy trình, chưa có công cụ |
| 3 | Giảm `report_progress` thừa: skill nói rõ helper đã ghi gì; cân nhắc để `submit_work` nhận cả `BLOCKER` | cân nhắc |
| 4 | Rút ngắn transcript: không in lại nội dung file dài, dùng `rg` với giới hạn dòng; đo lại token/item ở đề khác | cân nhắc |
| 5 | Chạy vòng 4 với đề *khác* khi BTC có, trên tài khoản đủ hạn mức | khi có |

---

## Vòng 3 → Vòng 4: CTG2YCRL (23:21–00:24) → FWBI6I0S (09:51–10:59), 27/10/2026

Cùng seed Solova lần thứ tư (xác nhận bằng `git diff` giữa hai seed: không khác gì). Vòng 4 chạy pack 1.2.1
(sửa DISCOVERED) trên Player **0.9.35** (BTC đổi bản sáng 27/10). Tài khoản Codex Plus, hạn mức đã hồi.

### 1. Kết quả vòng 3 (CTG2YCRL) và nhược điểm

| Chỉ số | Giá trị |
|---|---|
| Item nộp / ACCEPTED | 3 / 5, đều DONE; CR-01 và TASK-01 không làm |
| Nguyên nhân mất 2 item | tài khoản Codex Plus hết hạn mức lúc 23:42, agent chết 42 phút cuối |
| Guardian | 1 lượt (vòng 2: 110) |
| Lỗi helper | DISCOVERED thiếu ở wave 1 khi `configure_session` đến sau `refresh_match` |
| Token session chính (21 phút làm việc) | 8,6M |

Nhược điểm chính: vận hành (hạn mức tài khoản) và một lỗi nhỏ của helper.

### 2. Thay đổi ở vòng 4 và kết quả

| # | Thay đổi | Ở đâu |
|---|---|---|
| 1 | Helper ghi DISCOVERED ở mọi lần đọc trận trong phase GAME và ở `start_work` (pack 1.2.1, có mock test) | helper |
| 2 | Player 0.9.33 → 0.9.35 (bắt buộc: bản cũ bị Game Master từ chối poll, `MATCH_STATUS_AUTH_REJECTED`) | môi trường |
| 3 | SETUP.md, tools/ cho teammate; repo đẩy lên GitHub riêng | harness |

Kết quả vòng 4 (FWBI6I0S), so với vòng 3 và vòng 2 (vòng trọn vẹn gần nhất):

| Chỉ số | Vòng 2 | Vòng 3 | Vòng 4 |
|---|---|---|---|
| Item nộp / ACCEPTED | 5/5 | 3/5 | **5/5** |
| Status | 5 PARTIAL | 3 DONE | **4 DONE + TASK-01 PARTIAL** (đúng: commit đề tham chiếu không có) |
| Sai schema / test bị sửa / tra web / script trong src | 0 | 0 | 0 |
| DISCOVERED | đủ | thiếu wave 1 | **đủ, trước Start Work** |
| Lượt guardian | 110 | 1 | **0** (không có session guardian) |
| Token tổng (session chính + guardian) | 26,3M | 8,6M (dở) | **16,6M** (một session) |
| Token lúc chờ hết trận (29,7′) | 4,2M | – | 4,7M |
| Lệnh gọi helper | ≈108 | 38 (3,x item) | 53 (5 item; `report_progress` vẫn 14) |
| Lệnh shell / lỗi | – | 100 / 9 | 116 / 14 |
| Lượt model lỗi (hạn mức) | 0 | 105 | **0** |
| Mở→nộp: BUG-02 / BUG-01 / CR-01 / TASK-02 / TASK-01 | 4,4 / 10,5 / 3,3 / 6,8 / 1,1′ | 4,9 / 11,8 / – / 4,1 / – | **4,1 / 8,5 / 2,7 / 5,8 / 1,2′** |
| Wave 1 / 2 / 3 mở lúc | – | – | 09:59 / ≈10:13 / ≈10:28 (phút 0 / 14 / 29) |

Diễn biến khác: sau khi tắt 0.9.33 và mở 0.9.35, Player **tự tiếp tục** round đã Initialize (round02) với credential
đã lưu, không cần nhập lại.

### 3. Thảo luận

- **Vòng trọn vẹn đầu tiên không có sự cố**: 5/5 nộp, 0 guardian, 0 lỗi model, mọi gate hoạt động. Token cho cả
  trận 62 phút với 5 item là 16,6M, bằng 63% của vòng 2 (26,3M), dù số item bằng nhau.
- **Một bẫy mới, do chính môi trường của đội**: baseline "12/12 test pass" là ảo. Seed vẫn có migration CASCADE,
  nhưng database cục bộ `freelanceos` / `freelanceos_test` còn giữ migration RESTRICT mà agent đã áp ở vòng 3
  (kiểm bằng `tools/db-state.ps1`: `_prisma_migrations` có `20261026163000_restore_financial_history_restrict`,
  FK đang là RESTRICT). Agent tin test, **không thêm migration vào code**, nên 4 bài khai DONE với tiêu chí "existing
  tests pass" nhưng Grader chạy trên DB sạch sẽ thấy test cascade fail. Nguy cơ mất tiêu chí ở 4 item, giống vòng 2
  nhưng vì lý do ngược lại. Bài học: môi trường dùng chung giữa các trận làm sai lệch baseline; mỗi trận phải có
  database riêng, và phải phán đoán lỗi từ code (thư mục migration) chứ không chỉ từ kết quả test.
- **Chi phí còn lại nằm ở đâu**: 3 khoảng chờ chiếm 7,6M/16,6M (46%), mỗi lượt chờ vẫn gửi lại ~1M ngữ cảnh cache.
  Item tốn nhất vẫn là BUG-01 (2,64M). `report_progress` vẫn được gọi 14 lần dù helper đã tự ghi test events: agent
  ghi thêm RUNNING và các event khác; không sai, chỉ thừa.
- **Player 0.9.35 đổi cơ chế xác thực poll** sang Team API Key: pack không cần sửa, nhưng mỗi khi BTC đổi bản,
  bản cũ chết ngay. Trước trận chính thức phải kiểm bản Player trên trang Team pack.
- Vẫn chưa có điểm Grader cho trận nào.

### 4. Cải thiện tiếp theo (cho vòng 5)

| # | Việc | Trạng thái |
|---|---|---|
| 1 | Database riêng cho mỗi trận (`freelanceos_<matchId>` / `_test`), kiểm migration DB so với thư mục migration trước baseline; ghi vào skill chuẩn bị, solova.md, LESSONS | áp dụng (pack 1.2.2) |
| 2 | `tools/db-state.ps1` để kiểm trạng thái DB cục bộ trước trận | áp dụng |
| 3 | Kiểm bản Player trên trang Team pack trước mỗi trận (mục 3 SETUP.md) | quy trình |
| 4 | Giảm `report_progress` thừa; cân nhắc rút ngắn ngữ cảnh khi chờ | cân nhắc |
| 5 | Quy tắc PI vs item sắp hết hạn (PI trước, trừ khi item deadline đang dở và nộp được trong ~3 phút) | chờ quyết định |
| 6 | Vòng 5 nên chạy trên DB sạch để xác nhận agent xử lý cascade đúng ở seed này | khi chạy tiếp |

---

## Khung ghi cho các vòng sau

```
## Vòng N → Vòng N+1: <ID cũ> → <ID mới>, <ngày>
### 1. Kết quả vòng N và nhược điểm
### 2. Thay đổi ở vòng N+1 và kết quả (bảng so sánh cùng chỉ số)
### 3. Thảo luận (tách phần nhờ quy trình / phần nhờ quen đề / chưa kiểm chứng được)
### 4. Cải thiện tiếp theo (việc, trạng thái)
```
