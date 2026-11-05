# team-sdlc-pack 1.5.9

Nền: 1.5.8. Ghi chú các bản trước nằm trong lịch sử git.

## Vì sao (trận 5FLQMNAA: 1000/1000, PI hạng nhất, nhưng 37m48s và khoảng 33M token)
- **Orchestrator chiếm 13.7M token (41%).**
  - 168 lượt, context trung bình 83k, lớn nhất 191k.
  - Phần lớn lượt chỉ để kiểm tra: `wait` với yield 1000/60000, 15 lần `sleep` 50 giây.
  - Mỗi lượt như vậy gửi lại toàn bộ context.
- **Output lớn nằm lại trong context:**
  - ảnh `view_image` 290–515k ký tự mỗi ảnh (orchestrator 3 ảnh, worker 9 ảnh);
  - board trong mỗi lần `wait_for_update` 4–26k ký tự (id, endpoint, tiêu đề lặp, startInstruction);
  - `wait_jobs` tail tới 23k ký tự.
- **Worker** dùng 76 lần `wait` 10 giây.
- **Orchestrator tự làm BUG-04 trong s4** (02:03–02:16):
  - BUG-01 xong lúc 02:05:31 nhưng tới 02:09:09 mới được tích hợp;
  - context của orchestrator phình lên 191k.
- **5 lệnh cài slot chạy cùng lúc, mất khoảng 12 phút.** Worker đầu tiên chờ `install-s2` khoảng 4 phút sau khi trận bắt đầu.
- **BUG-01 mất khoảng 10 phút** vì đọc CSS đã biên dịch và khởi động lại dev server nhiều lần; cuối cùng lấy evidence bằng production build.

## Thay đổi
### 1. Orchestrator không nhận BUG/CR (helper + SKILL.md)
- `start_work` ở s4 với BUG/CR trả `OWN_SLOT_RESERVED`:
  - nếu có slot worker rảnh, lỗi nêu tên slot đó;
  - nếu không, item chờ slot worker rảnh đầu tiên (`integrate_item` với `next`).
- **Ngoại lệ:** PI, TASK, item heavy khi s5 không dùng được, và chế độ không có slot worker.
- **SKILL.md:** s4 chỉ cho PI và TASK trả lời bằng giá trị: một script rồi `answer_item integrate:true`, giữa các bước gọi `wait_for_update noWait`.
- **Board:** slot có DONE.json mà orchestrator chưa thấy hiện ngay trạng thái `DONE`. Gặp slot `DONE` thì tích hợp trước mọi việc khác.

### 2. Output gọn (helper)
- **Board:**
  - `wait_for_update`, `submit_work`, `integrate_item` và `answer_item` trả board gọn. Mỗi item chỉ có key, type, title (≤90 ký tự), status, workStatus, points, deadline, minutesLeft, submitted, heavy, slot, cùng `revisionNo` khi >1.
  - Không còn team, endpoints, trackedStatus.
  - `refresh_match` vẫn trả board đầy đủ.
- **Kết quả submit/integrate:** bỏ danh sách evidence (thay bằng `evidenceFiles` là số file); receipt và tests chỉ giữ các trường cần.
- **`validate_answer`:** `evidenceFiles` là số file.
- **`company_tool_call`:** câu trả lời trên 6000 ký tự được ghi ra file (slot của item, nếu không có thì `.mtm-tmp` của checkout chính) và chỉ trả `savedTo` kèm head 300 ký tự. Trước đây chỉ worker và `saveToSlot` được làm vậy.
- **`wait_jobs`:** tail tối đa khoảng 1500 ký tự mỗi job, dòng dài cắt ở 300 ký tự; log đầy đủ vẫn nằm trong file.

### 3. Chờ một lần cho đủ lâu (SKILL.md, WORKER.md, 4 file agent)
- Cell còn "Script running": một lần `wait` với `yield_time_ms: 270000`.
- Đã đo trong 5FLQMNAA: `wait` trả về ngay khi cell xong, nên yield dài không làm chậm.
- Cấm `sleep`, cấm yield ngắn.
- Orchestrator không dùng `view_image`. Worker chỉ xem ảnh evidence cuối cùng khi không kiểm được bằng text, mỗi ảnh một lần.

### 4. Cài slot worker trước (ENVIRONMENT.md phần B)
- `install-s4` và `install-s5` chờ `install-s1`..`install-s3` có file exit (tối đa 10 phút) rồi mới cài.
- s1–s3 không còn tranh disk với 4 lệnh cài khác, nên xong sớm hơn cho đợt item đầu.
- READY vẫn không chờ việc cài slot.

### 5. Bài học dev-server (WORKER.md, LESSONS.md)
- Thay đổi không hiện trong dev server: khởi động lại một lần.
- Vẫn không hiện: kiểm và lấy evidence trên production build, tìm nguyên nhân trong source; không đọc bundle hay cache đã biên dịch.

### 6. Đo đạc sau trận
- **Helper ghi `<checkoutRoot>/.git/mtm/timeline.ndjson`** (có timestamp) cho các sự kiện:
  - DISCOVERED, START_WORK (slot), INCIDENT_READY (số giây), SLOT_DONE_SEEN (thời điểm thật của DONE.json), INTEGRATED, SUBMITTED, JOB_END_SEEN.
  - Progress log của Player không nhận thêm trường, nên timeline nằm riêng.
- **`scripts/match-report.mjs`** (công cụ review, không nằm trong gói runtime):
  - token theo từng agent: lượt, context trung bình và lớn nhất, số lần chờ ngắn, `sleep`, ảnh, output lớn nhất;
  - thời gian từng item: chờ slot / làm / chờ tích hợp.
  - Lệnh: `node scripts/match-report.mjs --sessions <thư mục rollout> --timeline <timeline.ndjson>`.

## Kiểm thử
- **`deadline.test`:**
  - BUG ở s4 bị từ chối, lỗi nêu slot worker rảnh;
  - board trong `wait_for_update` chỉ có các trường quyết định và dưới 1200 ký tự.
- **`incident.test`:**
  - slot có DONE.json hiện `DONE` trên board;
  - Company Tools: câu trả lời lớn ra file trong slot (head ≤300), câu nhỏ trả inline;
  - timeline có DISCOVERED, START_WORK, INCIDENT_READY và SLOT_DONE_SEEN (có `doneAt`).
- **`helper.test`:** kết quả submit gọn (không có danh sách evidence, không có endpoints, dưới 2000 ký tự).
- **`jobs.test`:** job nhiều log trả tail ≤1500 ký tự, vẫn có dòng cuối.
- Toàn bộ 6 file test pass; check-distribution READY (19 tool).
- `match-report.mjs` đã chạy trên rollout thật của 5FLQMNAA: 33.33M token, orchestrator 41%, 168 lượt, 40 lần chờ ngắn, 15 lần `sleep`.

## Chưa kiểm chứng
- **Mức giảm token** ước tính khoảng 35–45% (orchestrator từ 13.7M xuống khoảng 4–6M); cần trận tiếp theo để đo bằng `match-report.mjs`.
- **Đánh đổi:** BUG/CR không còn chạy ở s4 khi 3 worker đều bận, nên có thể chờ slot lâu hơn một chút. Bù lại, việc tích hợp không còn bị chặn. Nếu muốn nhanh hơn nữa, có thể cho s5 làm worker thường khi không có item heavy (chưa làm trong bản này).
