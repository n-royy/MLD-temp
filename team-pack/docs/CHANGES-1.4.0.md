# 1.4.0: lập kế hoạch theo wave, một worker cho mỗi nhóm, sửa baseline từ phút 0

Lý do (trận 7GAZA14X, bản 1.3.3): token giảm còn 12,7M (so với 25–28M ở BCYRV9M9), nhưng BUG-01 (sidebar che nội
dung) và BUG-02 (tiền VND) chạy song song:
- kịch bản UI của BUG-02 không kiểm được vì lỗi sidebar còn nằm trong slot của nó;
- bản sửa baseline nằm ở một slot, slot kia phải chờ;
- cả hai mất 16–17 phút, BUG-02 phải nộp PARTIAL lúc sát deadline.
Đây là lỗi của cách chia việc, không phải do tiết kiệm token.

| Thay đổi | Ở đâu |
|---|---|
| **Lập kế hoạch theo wave**: gom item thành nhóm khi chúng chung trang, module hoặc bảng dữ liệu, hoặc khi kịch bản của item này cần item kia đã sửa. Một nhóm do một worker làm nối tiếp; chỉ các nhóm độc lập mới chạy song song. Trong mỗi nhóm, sắp thứ tự theo deadline. | SKILL "Wave planning", profile orchestrator |
| **`integrate_item {next}`**: nộp item xong thì `start_work` ngay item kế tiếp của nhóm trong cùng slot (slot được reset về đầu nhánh, đã gồm item vừa nộp). Worker nhận item mới bằng `followup_task`, giữ được server đang chạy và những gì đã hiểu về code. | helper, SKILL bước 6, WORKER "Groups" |
| **Sửa baseline từ phút 0**: lúc chuẩn bị, scout soạn và kiểm thử patch trong slot s1 (`.mtm-tmp/baseline/baseline.patch`, không commit). `apply_baseline` commit patch đó ngay sau `start_work` đầu tiên, trước khi tạo worker, và đưa các slot chưa làm gì lên commit mới. Patch chỉ được sửa trong folder được giao, không được sửa test có sẵn, không được chứa credential. | helper, ENVIRONMENT phần F, SKILL "Baseline repair first" |
| **Chặn mất việc**: `start_work` từ chối dùng lại một slot còn commit chưa ghép (`SLOT_HAS_UNINTEGRATED_WORK`); `release_slot` là cách bỏ việc có chủ ý. | helper |
| **Orchestrator im lặng khi chờ**: `wait_for_update` luôn chặn 240 giây (bỏ qua timeout ngắn), không viết câu cập nhật nào giữa các lần chờ. | helper, SKILL, profile |
| **Scout** chạy lệnh dài với `yield_time_ms` dài. | profile scout |

Kiểm thử: `node --test tests/helper.test.mjs tests/slots.test.mjs tests/groups.test.mjs` cho kết quả 4/4. Test mới
`groups` kiểm tra:
- `apply_baseline` báo `NOT_STARTED`, `NO_BASELINE_PATCH`, `OUTSIDE_FOLDER` đúng trường hợp; khi đủ điều kiện thì commit đã push và gọi lại không có tác dụng gì thêm;
- slot đầu tiên được đưa lên commit baseline;
- chuỗi TASK-01 → BUG-01 chạy trong cùng một slot mà không tạo commit trùng;
- `SLOT_HAS_UNINTEGRATED_WORK` chặn đúng, và `release_slot` cho phép bỏ việc có chủ ý.

Audit rule: 75/76 cụm của bản 1.2.2 vẫn còn. Cụm "MVS is only the minimum" đã được thay ở 1.3.2 theo yêu cầu chỉ
test đúng các TC trong mẫu.

Cần đo ở trận tiếp theo (so với 7GAZA14X):
- điểm, và có item nào PARTIAL vì phụ thuộc giữa các item không;
- thời gian mở → nộp của từng item;
- token của orchestrator, scout và từng worker;
- số lượt chờ của orchestrator;
- baseline được sửa ở phút thứ mấy.
