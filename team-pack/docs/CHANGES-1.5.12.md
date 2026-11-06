# team-sdlc-pack 1.5.12

Nền: 1.5.11. Ghi chú các bản trước nằm trong lịch sử git.

## Vì sao
- BTC không dùng tiền tố `[Heavy …]` nữa. Item heavy phải được nhận ra từ nội dung brief.
- Đề sau có thể có những kiểu item chưa từng gặp. Orchestrator và worker cần một cách làm chung, không phụ thuộc tên hay kiểu item.

## Thay đổi
### 1. Bỏ nhận diện heavy theo tiền tố tiêu đề
Tiêu đề có `[Heavy Task]` không còn tự động là heavy; chỉ nội dung brief quyết định.

### 2. Hồ sơ công sức (effort profile) từ brief (`effortOf`, helper)
- **Điểm từ các tín hiệu chung:**
  - **Dữ liệu cần xử lý:** file nén trong `data/` (+3) hoặc file dữ liệu thường (+1). Nếu file có trong checkout và ≥ 300 KB thì +1.
  - **Khối lượng nêu bằng số** (≥ 10.000 records/rows/events…): +2. Có "very large"/"millions": +1.
  - **Bẫy làm sạch dữ liệu:** từ 3 loại trở lên (dedup, reversed, superseded, noise, retried, canary, shadow, healed, void…) +2; ít hơn +1.
  - **Câu trả lời tổng hợp:** từ 4 trường trở lên và có gom nhóm (per…, for every…, as an object, sorted by): +1.
  - **Brief nhiều yêu cầu:** từ 6 yêu cầu đánh số trở lên: +1.
  - **Điểm cao hơn trung vị** các item cùng loại: +1. Brief dài gấp 1.6 lần trung vị (và ≥ 3500 ký tự): +1.
  - **BTC gợi ý trực tiếp về item** ("heavy task", "expensive item", "long-running job"…): +2. Chữ "heavy" đứng riêng không tính; ví dụ "a heavy library" của Solova CR-01 không được cộng.
- **Mức:** `XL` (≥ 5) → heavy, vào s5. `L` (3–4) → heavy candidate, vào s5 khi s5 rảnh. `M`/`S` → item thường.
- **Board:** `effort`, `heavy`, `heavyCandidate`, `effortReasons` (tối đa 4 lý do) và `gradingKind`.
- **Brief:**
  - `effort` (mức và lý do);
  - `grading`: nguyên văn mục Grading/Score của BTC, tối đa 1500 ký tự, để worker lên kế hoạch cho cả kiểu item chưa có playbook.
- **Đã chạy trên brief thật (bỏ tiền tố):**
  - 32PTEO8K: TASK-10 = 9 và TASK-12 = 8 (đều XL); 10 item còn lại ≤ 1.
  - 5 trận Solova (50 brief): tối đa 2 điểm, không báo nhầm.

### 3. Orchestrator (SKILL.md mục mới "Item profile", file agent)
- **Thứ tự quyết định:**
  1. Độ gấp: PI, item có deadline, item điều kiện.
  2. Công sức: heavy vào s5; heavy candidate vào s5 khi rảnh.
  3. Giá trị: điểm trên công sức.
  4. Cách chấm: item có `gradingKind` giữ slot cho quality gate.
- **Ghi lý do:** mỗi quyết định heavy hoặc candidate ghi một dòng lý do.

### 4. Worker (WORKER.md mục mới "An item of a kind no section here names")
- Lên kế hoạch từ `grading`: liệt kê những gì được chấm và cách chấm.
- Giữ điểm từng phần, commit câu trả lời hợp lệ sau mỗi phần (status PARTIAL tới phần cuối).
- Ưu tiên chạy code thật và dữ liệu thật.
- Áp dụng quality gate gần nhất nếu cách chấm thưởng nhiều hơn các dòng.
- Đọc `effort` trong brief để biết BTC dự kiến item tốn bao nhiêu thời gian.

## Kiểm thử
- **`tests/effort.test.mjs` (mới), với brief thật của 32PTEO8K đã bỏ tiền tố:**
  - đúng TASK-10 và TASK-12 là heavy; không item nào là candidate; các item khác ≤ 2;
  - tiền tố hoặc chữ "heavy library" không làm item thành heavy; gợi ý "heavy task" được tính; kích thước file thật được cộng.
- **`incident.test`:** các test heavy cũ dùng brief dạng dữ liệu lớn thay cho tiền tố. Item có tiêu đề `[Heavy Task]` nhưng brief nhẹ thì không còn là heavy. Brief có `effort.level` XL và `grading`.
- Toàn bộ 7 file test pass; check-distribution READY.
