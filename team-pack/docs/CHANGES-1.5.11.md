# team-sdlc-pack 1.5.11

Nền: 1.5.10. Ghi chú các bản trước nằm trong lịch sử git.

## Vì sao (trận 32PTEO8K)
- **TASK-08 (84/100):** viết bộ test, chấm theo số bản build hỏng mà bộ test phát hiện. Item không có deadline nhưng nộp ở phút 12 của trận 40 phút, trong khi `updateTransfer` vẫn còn lỗi cài sẵn chưa bị bắt.
- **TASK-07 (35/50):** gói dữ liệu, chấm theo từng yêu cầu. Nộp khi các số tự báo còn nằm sát ngưỡng. Worker chỉ khôi phục một file source về bản gốc khi replay.
- **Chung:** worker dừng khi các dòng của item đã pass, dù cách chấm còn thưởng thêm phần khác và thời gian vẫn còn.

## Thay đổi
### 1. Helper nhận diện cách chấm (`#gradingKind`)
- Đọc mục "Grading" của brief (nếu không có thì đọc cả brief):
  - **`SUITE_DETECTION`:** broken builds, detection share, "break one part";
  - **`DATA_REQUIREMENTS`:** manifest, dataset, pack, kèm volume, mix, overlap, at most/at least;
  - **`OFFICIAL_DATA`:** official test data, hidden tests.
- Đã chạy thử trên 12 brief thật của 32PTEO8K:
  - TASK-08 → `SUITE_DETECTION`, TASK-07 → `DATA_REQUIREMENTS`;
  - CR-07, BUG-09, BUG-11 → `OFFICIAL_DATA` (cả ba có hidden tests);
  - 7 item còn lại (PI, TASK trả lời giá trị) → null, không có gate.
- **Brief** có thêm:
  - `qualityGate {kind, required, reportFile}`;
  - `issuedRevision` (source như lúc phát đề).
- **`SLOT_DONE`:** mỗi entry có `qualityGate {kind, status, minutesLeft, summary}`. Status là `MISSING` khi DONE.json không có gate.

### 2. Worker (WORKER.md mục "Quality gate", hai file agent worker)
- **Thời điểm:** sau khi các dòng pass và đã commit, nếu `stopBy` (hoặc `effectiveDeadlineAt`) còn hơn khoảng 8 phút thì chạy gate theo kind. Dừng ở `stopBy` trừ khoảng 5 phút.
- **Ghi kết quả:** bảng vào `quality-gate.md`; DONE.json có `"qualityGate":{"kind","status":"PASS|PARTIAL","summary"}`.
- **Dọn dẹp:** không để lại mutant hay source tạm khôi phục; `git status` phải sạch.
- **`SUITE_DETECTION`:**
  - lập ma trận luật × thao tác × trường, kèm biến thể (giá trị biên hai phía, 0, rỗng, không phải ASCII, chạy lô);
  - tự đột biến từng luật trong slot rồi hoàn lại; luật nào không có case fail thì thêm case;
  - không assert điều spec không nêu.
- **`DATA_REQUIREMENTS`:**
  - lập bảng yêu cầu → giá trị đạt → khoảng dư; không nằm sát biên;
  - replay trên `issuedRevision`: khôi phục **mọi** file source sản phẩm khác bản gốc, chạy, rồi trả lại;
  - mọi con số trong manifest phải khớp tuyệt đối với kết quả replay.
- **`OFFICIAL_DATA`:**
  - nạp dữ liệu chính thức bằng chính branch của mình (đã có các thay đổi mà item này `dependsOn`), so với giá trị tính độc lập;
  - viết test riêng cho từng biên của luật, vì hidden tests kiểm nhiều trường hợp hơn MVS.
- **Ngoại lệ:** luật "Test exactly the item's test cases, no more" không áp dụng cho gate.

### 3. Orchestrator (SKILL.md, file agent)
- **`slotDone` có gate `MISSING` và còn hơn 8 phút:** chưa tích hợp; `followup_task` một lần để worker chạy gate.
- **Còn 8 phút trở xuống, hoặc đã nhắc một lần:** tích hợp luôn.

## Kiểm thử
- **`incident.test`, test mới với 4 brief mẫu:**
  - kind lần lượt là `SUITE_DETECTION`, `DATA_REQUIREMENTS`, `OFFICIAL_DATA` và null cho BUG chỉ có MVS;
  - brief có `reportFile` và `issuedRevision`;
  - DONE.json không có gate → `MISSING`, có `minutesLeft`; có gate PASS → `PASS`; item không có gate → không có trường này.
- Toàn bộ 6 file test pass; check-distribution READY.
