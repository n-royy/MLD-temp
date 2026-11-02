# 1.5.0: theo đúng dạng đề chính thức (warm-up 5APIQYXW)

Đặc điểm đề chính thức:
- 10 item, tổng 1000 điểm, 40 phút, mở ra trong 4 wave (phút 0, 8, 12, 20).
- 4 item có deadline cứng (8, 15, 15, 18 phút); PI-01 vừa có deadline vừa tính điểm theo thứ tự nộp.
- 4 item lấy nửa số điểm từ hidden test gọi thẳng pure function theo chuẩn của công ty (lưu trong KB).
- 2 item là câu hỏi lấy giá trị tính từ mã nguồn.
- Grader khôi phục các file test/config được liệt kê trước khi chạy test.
- Trận warm-up đó nộp được 8/10 item: CR-02 chưa bắt đầu, TASK-04 vẫn đang chạy khi hết giờ.

| Thay đổi | Lý do | Ở đâu |
|---|---|---|
| **Relay Company Tools cho worker:** helper của orchestrator mở cổng chuyển tiếp trên 127.0.0.1, xác thực bằng token ngẫu nhiên; worker gọi `company_tool_call({..., slotMatchRoot})`. Không file nào chứa team key; câu trả lời dài được lưu thành file trong slot | Ở trận 7GAZA14X, worker gọi company tools bị `NOT_CONFIGURED` (mỗi subagent có helper riêng, chưa được cấu hình), phải tự đoán chuẩn export | `src/company-proxy.mjs`, helper, WORKER, profile |
| **Bốn loại item** với cách làm riêng: (1) hàm có hidden test → bảng rule + test cho từng rule/biên; (2) PI → đọc log bằng script, chuỗi khớp chính xác; (3) câu hỏi giá trị → chạy code thật trên dữ liệu QA; (4) UI/bug → chụp evidence "trước khi sửa" trước | Nửa số điểm của 4 item nằm ở hidden test | WORKER |
| **Sự thật về grader:** không sửa các file grader sẽ khôi phục; test mới đặt trong file mới; bản chuẩn hiện hành trong KB đè lên mọi ghi chú cũ | Brief chính thức | WORKER, LESSONS |
| **Lập lịch theo dạng đề:** item có deadline chiếm slot trống tiếp theo; PI hoặc TASK có deadline khi cả 3 slot đều bận thì orchestrator tự làm; không để item nào chưa bắt đầu khi còn slot trống; từ phút 25 bắt đầu mọi item còn kịp làm | Trận warm-up mất 190 điểm vì 2 item không nộp được | SKILL |
| `solova.md` hạ xuống mức "ghi chú từ trận thử": seed có thể cài bẫy ngược lại (ví dụ cascade test là bên sai) | Brief chính thức cho phép sửa `tests/cascade.test.ts` | products |

Kiểm thử: 4/4 pass. Test `groups` có thêm phần relay:
- helper chưa cấu hình gọi trực tiếp → `NOT_CONFIGURED`;
- gọi qua `slotMatchRoot` → có kết quả, câu trả lời dài được lưu thành file;
- token sai → `PROXY_TOKEN_REJECTED`;
- file relay không chứa key và không lộ ra trong git status.
