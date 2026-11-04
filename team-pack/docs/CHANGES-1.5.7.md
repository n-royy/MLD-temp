# team-sdlc-pack 1.5.7

Nền: 1.5.6 (đường nhanh PI bằng code). Ghi chú của các bản trước nằm trong lịch sử git.

## 1. Luật baseline (từ trận 5WUV2IYM: BUG-02 được 80/100 vì "existing tests pass" FAIL)
- **Bản vá baseline** (ENVIRONMENT.md phần F):
  - chỉ vá drift cấu hình hoặc migration trái tài liệu thiết kế, không bao giờ vá logic sản phẩm;
  - bản vá đạt khi test được sửa pass và không làm hỏng test nào đang pass. Lỗi logic của item khác được phép còn đỏ, nên "suite chưa xanh hết" không còn là lý do bỏ qua một bản vá cấu hình rõ ràng;
  - bản vá là file patch làm trong slot s1, không phải sửa file tracked của checkout.
- **Baseline owner** (SKILL.md): là item có deadline gần nhất trong số các item cần "existing tests pass". Item không deadline chỉ làm owner khi không có item deadline nào cần. Ghi chú gửi owner kèm đường dẫn `baseline/README.md` của scout.
- **Worker** (WORKER.md): trước khi báo FAIL vì lỗi baseline đã biết, kiểm `git log HEAD..<branch>`; nếu đã có bản sửa lên branch thì rebase và chạy lại suite. Owner có deadline sửa baseline trước.
- LESSONS.md: bài học baseline viết ở dạng nguyên tắc chung.

## 2. Luật viết dạng tổng quát (chống overfit cho đề mới)
- Các luật mới không còn nhắc tên trận, tên item, tên test, migration hay kiểu sự cố cụ thể.
- Incident fast path (SKILL.md): tính mọi trường brief hỏi theo định nghĩa trong KB và brief, chứng minh mỗi giá trị bằng dòng log. Tập hợp phải đủ (join sự kiện của từng bản ghi theo thời gian, không chỉ những bản ghi bị báo); "first/earliest" theo timestamp; chuỗi đúng như log.
- `src/incident.mjs`:
  - không còn danh sách service cố định. Khi phải lọc, tên service lấy từ log, brief và KB, cuối cùng mới tới vài tên chung;
  - không còn khuôn mã release cố định: "change events" là các dòng log có khóa release, version, build, deployment, components, changes hoặc flags;
  - tham chiếu bài KB nhận theo dạng id của các bài đã tìm thấy. KB được lấy trước log.

## 3. Item heavy (tiêu đề có prefix `[Heavy ...]`, ví dụ `[Heavy Task]` ở warm-up)
**Helper**
- Board gắn `heavy: true` theo prefix của tiêu đề. Chữ "Heavy" nằm giữa tiêu đề không tính.
- Brief và kết quả `start_work` có `heavy`, `deadlineAt`, `matchEndsAt`, `stopBy` (mốc nào đến trước).
- `DEADLINE_SOON` của item heavy đến lúc còn khoảng **1,5 phút** (item thường vẫn 3 phút), có `heavy: true` và `action: INTEGRATE_LAST_COMMIT_NOW`.
- Slot **s5** cho worker heavy:
  - `prepare_slots` tối đa 5 slot; `start_work`, `release_slot`, `prepare_incident` chấp nhận s5;
  - board ghi role `heavy-worker`;
  - PI không bao giờ được đặt vào s5.
- `wait_for_update` có tham số `noWait: true`: kiểm tra một lần rồi trả ngay.

**Chuẩn bị**
- `prepare_slots` với `count: 5`; cài thêm `install-s5`.

**Orchestrator (SKILL.md, agents/team-orchestrator.toml)**
- Tối đa 5 agent cùng lúc: orchestrator, 3 worker (s1–s3), 1 worker heavy (s5). Codex cho phép mặc định 6.
- Item heavy nằm ngoài thứ tự ưu tiên thường. Ngay khi xuất hiện (sau PI nếu cùng wave): `start_work` ở s5 và spawn agent loại **`team_heavy_worker`**; nếu loại này bị từ chối thì spawn `team_feature_worker`.
- Worker s5 làm trọn item, xong thì tích hợp khi có `SLOT_DONE`. Lần gọi cuối (khoảng 1,5 phút trước khi hết giờ): `integrate_item` với `allowUncommitted: true` ngay, không nhắn và không chờ worker.
- Mỗi lúc s5 làm một item heavy. Item heavy thứ hai chờ s5, hoặc lấy slot s1–s3 nếu đang rảnh và không item nào khác chờ.
- Dự phòng khi không có s5 hoặc agent thứ 5 bị từ chối:
  - item heavy lấy slot worker sau khi mọi item khác đã được start, bất kể thời gian còn lại;
  - hoặc orchestrator tự làm ở s4 khi s1–s3 đều bận: làm từng bước ngắn, gọi `wait_for_update` với `noWait: true` sau mỗi dòng và xử lý sự kiện trước.

**Agent mới `agents/team-heavy-worker.toml`**
- `model_reasoning_effort = "high"`. Các worker khác giữ mức mặc định của đội.
- Hướng dẫn đặt chất lượng lên trước: chỉ có một item, token không phải giới hạn, thời gian mới là giới hạn. Được viết test riêng trong file mới.

**Quy trình của worker (WORKER.md "Heavy items")**
1. `plan.md` trước khi sửa code: mọi dòng TC (chứng minh gì, kiểm thế nào, chi phí), tiêu chí, file dự kiến sửa, code dùng chung, rủi ro, thứ tự làm.
2. `progress.md` sau mỗi bước, để chống mất ngữ cảnh khi phiên dài bị nén.
3. Làm từng dòng, kiểm đúng cách. Sau mỗi dòng PASS: commit answer PARTIAL hợp lệ.
4. Tự rà soát mọi tiêu chí và mọi dòng với code, evidence và answer.
5. Đồng bộ với branch trước lần kiểm cuối: rebase nếu có commit mới, chạy lại suite, typecheck và mọi dòng.
6. Làm tới khi còn khoảng 2 phút tới `stopBy`; phần chưa commit sẽ mất.
7. Mọi dòng PASS: status DONE.

## Kiểm thử
- `tests/incident.test.mjs`: 9 test, gồm:
  - đường nhanh PI;
  - cờ heavy và `stopBy`;
  - lần gọi cuối 1,5 phút cho heavy;
  - `noWait`;
  - slot s5: role `heavy-worker`, PI không vào s5.
- `tests/slots.test.mjs`: số slot không hợp lệ đổi thành 6.
- Toàn bộ 6 file test pass; check-distribution READY.

## Chưa kiểm chứng trong trận thật
- 5 agent chạy cùng lúc. Đội cần tự xác nhận BTC cho phép.
- MTM Player có thể ghi đè `model_reasoning_effort` của `team_heavy_worker`.
- Tên tham số thật của tool log và KB: code đọc chúng lúc chạy và có đường lùi.
