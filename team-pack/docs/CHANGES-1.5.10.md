# team-sdlc-pack 1.5.10

Nền: 1.5.9. Ghi chú các bản trước nằm trong lịch sử git.

## Vì sao (trận 32PTEO8K: 942/1000, hạng nhất)
**CR-07 được 73/100.**
- Brief của CR-07 ghi rõ: audit dữ liệu chính thức "chỉ đúng trên source có bản sửa BUG-11". Grader nạp dữ liệu bằng chính source của CR-07.
- BUG-11 mở cùng lúc với CR-07 (04:59:52) nhưng không có deadline. Nó tới 05:18:08 mới được start, tức 6 giây sau khi CR-07 đã nộp.
- Orchestrator không đọc brief nên không biết BUG-11 là điều kiện của CR-07.
- Worker CR-07 thấy vấn đề nhưng luật "lỗi thuộc item khác thì không sửa" khiến nó nộp TC-02 FAIL.

**PI chen hàng:** trong lúc làm PI, mọi `SLOT_DONE` đều chen trước, kể cả của item không có deadline.

## Thay đổi
### 1. Đồ thị phụ thuộc từ brief (helper)
- **Cách dựng:** helper quét `descriptionMd` (và `description`, `startInstruction`) của mỗi item tìm key của item khác đã mở.
  - Item phụ thuộc mang `dependsOn: [...]`.
  - Item được nhắc tới mang `prerequisiteOf: [...]`.
- **`effectiveMinutesLeft`:** là deadline gần nhất trong các item chưa nộp phụ thuộc vào item đó, kể cả phụ thuộc gián tiếp (có chặn vòng lặp). Board hiện trường này khi nó khác `minutesLeft`.
- **Item điều kiện được đối xử như item có deadline:**
  - `stopBy` của nó tính theo `effectiveMinutesLeft`;
  - nó nhận `DEADLINE_SOON` với kind `PREREQUISITE_DEADLINE`, kèm `for: [...]`.
- **Brief:**
  - `dependsOn` và `prerequisiteOf` kèm trạng thái từng item (`NOT_STARTED` / `IN_PROGRESS` / `SUBMITTED`) và `deadlineMinutes`;
  - `effectiveDeadlineAt` cho item điều kiện.

### 2. PI chỉ nhường cho item có deadline (helper + SKILL.md)
- **Khi có PI đang mở và chưa nộp:** `wait_for_update` chỉ báo `SLOT_DONE` cho item có deadline hoặc item là điều kiện của item có deadline.
- **Slot xong khác:**
  - hiện trạng thái `DONE_HELD_FOR_PI`, liệt kê trong `board.heldForPi`;
  - được báo ngay sau khi PI nộp.
- **Giới hạn:** tối đa 8 phút kể từ khi PI xuất hiện, để PI bị kẹt không giữ việc đã xong quá lâu.
- `DEADLINE_SOON` vẫn luôn được báo như cũ.

### 3. Orchestrator (SKILL.md, file agent)
- **Thứ tự:** theo `minutesLeft`, hoặc `effectiveMinutesLeft` khi nhỏ hơn. Item điều kiện start không muộn hơn item cần nó, tốt nhất là trước.
- **Mục Incident fast path:** ghi rõ cái gì được chen trước PI.
- **Slot `DONE_HELD_FOR_PI`:** để yên cho tới khi PI nộp.

### 4. Worker (WORKER.md)
Mục mới **"Your item needs another item's changes"**: áp dụng khi điểm được chấm trên chính source của mình có kèm thay đổi của item khác.
- **Item kia đã SUBMITTED:** rebase trước bước kiểm cuối.
- **Item kia có thể không kịp** (trước `stopBy` trừ khoảng 5 phút):
  - tự làm thay đổi tối thiểu cần cho điểm của mình, commit riêng, ghi vào engineering record;
  - thay đổi giống hệt bên item kia sẽ tích hợp sạch.
- **Không nộp FAIL chỉ vì chờ item khác.**
- Luật "Owned by another item" có thêm ngoại lệ này.
- **Item điều kiện** coi `effectiveDeadlineAt` là deadline và commit trước phần mà item kia cần.

## Kiểm thử
- **`incident.test`, test mới theo kịch bản CR-17 (deadline 20) / BUG-21 / TASK-25:**
  - CR-17 có `dependsOn [BUG-21]`; BUG-21 có `prerequisiteOf [CR-17]` và `effectiveMinutesLeft` ≤ deadline của CR-17;
  - TASK-25 không có hai trường đó;
  - brief của CR-17 có BUG-21 `IN_PROGRESS`; brief của BUG-21 có `effectiveDeadlineAt` và `stopBy`;
  - BUG-21 và TASK-25 cùng xong khi PI mở: sau NEW_PI chỉ BUG-21 được báo SLOT_DONE; TASK-25 hiện `DONE_HELD_FOR_PI`; sau khi PI nộp thì TASK-25 được báo.
- **Test PI cũ:** BUG-07 (không deadline) giờ chờ PI rồi mới được báo.
- Toàn bộ 6 file test pass; check-distribution READY.
