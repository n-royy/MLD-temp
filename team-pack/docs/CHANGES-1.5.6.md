# team-sdlc-pack 1.5.6: đường nhanh cho PI, làm bằng code (P2XQMD8T)

Nền: `Megalodon-main` (1.5.5 cộng các chỉnh sửa của đội: overlap notice, UI foundation steps, preflight rebase).

## Vì sao
Ở P2XQMD8T, PI-01 của MLD đúng cả 5 trường (Grader 160) nhưng nộp thứ 2, nên chỉ được 90% = 144 (mất 16 điểm); QAI nộp trước.
Theo lịch sử commit:
- PI-01 mở lúc 09:47:14; MLD commit PI lúc 09:49:35 (2m21s).
- Đúng lúc PI mở, orchestrator đang tích hợp BUG-01 (09:47:07) rồi BUG-03 (09:47:48), vì `wait_for_update` kiểm `SLOT_DONE` trước item mới.
- Sau đó PI đi qua một worker mới spawn: đọc brief, WORKER.md, `company_tools_list`, gọi `search_logs` từng trang, viết script, nộp. Khoảng 15–20 lượt model.
- Phần thu thập (mọi trang log, các bài KB) là việc cơ học, không cần suy luận.

## Thay đổi
**Helper (code)**
- `src/incident.mjs` (mới) thu thập dữ liệu sự cố mà không phụ thuộc trận cụ thể:
  - đọc định nghĩa Company Tools lúc chạy (tên tool, tham số offset/page/cursor, limit, service, query);
  - phân trang từng truy vấn log tới đủ `total`. Thứ tự thử: không lọc; sau đó `query` rỗng; sau đó từng service (danh sách KB-OPS-01, các service đã thấy, và tên trong brief);
  - gọi `kb_search` cho quy tắc incident, tiêu đề brief, mọi mã `KB-…` được nhắc trong brief hoặc trong bài KB.
- Kết quả ghi vào `<slotMatchRoot>/.mtm-tmp/<ID>/incident/`:
  - `digest.md`: độ phủ từng truy vấn, service, release, feature flag, danh sách thực thể, danh sách KB;
  - `logs.json`: toàn bộ log, sắp theo thời gian;
  - `entities.json`: timeline theo từng mã hóa đơn hoặc ticket;
  - `kb.md`: bài KB đầy đủ;
  - `collection.json`.
  - Truy vấn nào dừng giữa chừng (ví dụ server bỏ qua offset) được đánh dấu `complete: false`, kèm lý do.
- Phát hiện tự động: khi helper thấy một item PI mới, nó lập tức Start Work trong slot rảnh (ưu tiên s4, sau đó s1–s3) và thu thập ở nền.
  - Hết slot rảnh: vẫn thu thập (vào `.mtm-tmp` của checkout chính) nhưng chưa start.
- `wait_for_update`:
  - lý do mới **`NEW_PI`** với `incident{}` (slot, briefFile, answerFile, validateCommand, doneFile, files, coverage, complete, `preparedInSec`). `NEW_PI` đứng trước mọi lý do khác, kể cả `SLOT_DONE`;
  - trước khi trả lời, một lần kiểm feed nhẹ phát hiện item vừa mở. Trong cùng vòng lặp, lần kiểm này thay cho lần đọc feed thường, nên số request không tăng;
  - mỗi PI chỉ báo một lần. Board có thêm `incidents[]` (PREPARING / READY / REPORTED / ERROR).
- Tool mới **`prepare_incident {backlogItemKey, slot?, refresh?}`**, dùng cho các trường hợp:
  - helper khởi động lại sau khi PI đã mở;
  - cần thu thập lại;
  - PI chưa start được vì lúc đó hết slot.
- Tắt được bằng `MTM_INCIDENT_FASTPATH=0`.

**Skill**
- SKILL.md: mục mới "Incident fast path" thay cho việc giao PI cho worker:
  - PI luôn do orchestrator làm, không đọc WORKER.md;
  - đọc `digest.md` và `kb.md`, viết một `solve.mjs` trên `logs.json`, điền answer, validate, commit, doneFile, `integrate_item`;
  - mọi việc tích hợp hay spawn khác chờ tới khi PI được nộp (trừ safety net DEADLINE_SOON).
- Đã sửa thứ tự wave và mục "The official format" theo luật mới. `agents/team-orchestrator.toml` cũng cập nhật.

## Kiểm thử
- `tests/incident.test.mjs` (mới, 5 test), dùng log PI-01 thật mà đội đã ghi lại (57 dòng, 8 service; 2 bài KB-OPS-01, KB-AR-05):
  - nhận diện tool và tham số phân trang;
  - 57/57 dòng thu được qua 3 trang; digest có `rel-20261027-2`, `reminders.statusFromCache`, `INV-MLD-1106`; `kb.md` đầy đủ;
  - tool bắt buộc lọc theo service vẫn thu đủ; server bỏ qua offset bị báo "paging stopped at 40 of 57";
  - qua helper thật với mock GM: một worker xong cùng lúc PI mở thì vẫn trả `NEW_PI` trước, rồi tới `SLOT_DONE`; PI đã được Start Work trong s4, file nằm trong slot, không báo lại; `prepare_incident` trả kết quả cũ; `refresh` thu thập lại;
  - hết slot: dữ liệu vẫn có, chưa start; khi một slot rảnh, `prepare_incident` start PI ở slot đó; item thường vẫn báo `MATCH_UPDATED` với `newItems`.
- Test cũ `deadline`, `groups`, `helper`, `jobs`, `slots`: pass.
- `check-distribution`: READY, 18 tool.

## Chưa kiểm chứng
- Tên tham số thật của `search_logs`/`kb_search` trên Game Master chưa được ghi lại. Code đọc chúng từ `tools/list` lúc chạy và có đường lùi. Nếu cách nào cũng thất bại, `incident.complete` là false và orchestrator tự phân trang như trước.
- Ước tính: dữ liệu sẵn trong khoảng 5–15 giây sau khi PI mở; orchestrator chỉ còn khoảng 5–7 lượt model (đọc digest và KB, script, answer, validate, commit, integrate) thay vì khoảng 15–20 lượt.
