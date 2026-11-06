# team-sdlc-pack 1.5.13

Nền: 1.5.12. Ghi chú các bản trước nằm trong lịch sử git.

## Vì sao
- **Thiếu tín hiệu cho heavy dạng code:** công thức effort của 1.5.12 chỉ nhận ra heavy dạng xử lý dữ liệu (TASK-10, TASK-12). Một CR/BUG lớn (nhiều phần, nhiều nguyên nhân) chỉ được S/M.
- **Item phải chờ slot worker:** 5FLQMNAA chờ 7–12 phút; BUG-11 ở 32PTEO8K chờ 18 phút. Quality gate (1.5.11) giữ slot lâu hơn, nên ba worker không đủ.

## Thay đổi
### 1. Heavy dạng code (`effortOf`)
- **Tín hiệu mới**, đọc từ brief:
  - nhiều phần cần xây (ít nhất hai mục in đậm kiểu `**Server.**`, `**Screen.**`): +1;
  - nhiều điểm chạm code (file `packages/…`, route `/…`, `data-testid`): +1 khi có 4–5, +2 khi có từ 6 trở lên;
  - nhiều nguyên nhân ("more than one cause", "several causes"…): +1;
  - từ 5 acceptance criteria trở lên: +1;
  - từ 5 kịch bản TC trở lên: +1;
  - hidden tests kiểm thêm ("many more cases", "other data", "whole pipeline"): +1.
- **Đã chạy trên brief thật:**
  - 32PTEO8K: CR-07 = 3 và BUG-11 = 3 (mức L, heavy candidate); TASK-10 = 9 và TASK-12 = 8 vẫn là XL; các item khác ≤ 1.
  - Solova 5FLQMNAA: CR-01 = 3 (L); các item khác ≤ 2.
- **Orchestrator:**
  - heavy candidate vào s5 khi s5 rảnh, nếu không thì vào slot worker;
  - candidate có deadline dưới 15 phút thì ở lại slot worker, vì heavy worker suy luận lâu hơn mỗi bước.

### 2. Worker thứ 4 (slot s6)
- **Slot:** `prepare_slots` nhận tới 6 slot; s6 là slot worker thứ 4 (`WORKER_SLOTS = s1, s2, s3, s6`).
  - s4 vẫn của orchestrator, s5 vẫn của heavy worker.
  - Port app theo slot: cổng mặc định + 10 × 6.
- **Helper:**
  - enum các tool nhận `s6`;
  - khi s4 bận, PI có thể dùng s6 (không bao giờ dùng s5);
  - lỗi `OWN_SLOT_RESERVED` cũng gợi ý s6 khi s6 rảnh.
- **Chuẩn bị:**
  - `prepare_slots count: 6`;
  - `install-s6` cùng nhóm với s4/s5: chờ s1–s3 cài xong (tối đa 10 phút) rồi mới cài.
- **Orchestrator:**
  - tối đa 6 agent cùng lúc (orchestrator, 4 worker, 1 heavy worker);
  - nếu `spawn_agent` từ chối vì quá nhiều agent thì để trống slot đó và xếp item vào hàng chờ.

## Kiểm thử
- **`effort.test`:** test mới với requirement thật của CR-07 và BUG-11.
  - Cả hai ở mức L, kèm lý do (parts, touchpoints, several causes).
  - Một BUG nhỏ ≤ 1 điểm; một CR phình to thì thành XL.
- **`incident.test`:** `prepare_slots count: 6` tạo s6, và board có s6 với vai trò worker.
- **`slots.test`:** count 7 bị từ chối.
- Toàn bộ 7 file test pass; check-distribution READY.

## Chưa kiểm chứng
- **Giới hạn agent của Codex:** MTM Player phải cho 6 agent cùng chạy. Theo tài liệu, `agents.max_threads` mặc định là 6. Nếu bị giới hạn thấp hơn, s6 không được dùng, và orchestrator xếp hàng như 1.5.12.
- **Tải máy:** 6 worktree và 6 lần cài trên Windows. s6 sẵn sàng muộn hơn s1–s3 vài phút.
