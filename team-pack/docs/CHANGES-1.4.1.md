# 1.4.1: chuẩn bị nhanh

Số liệu: trận 7GAZA14X mất 16,3 phút từ PREPARE đến ENVIRONMENT_READY. Trong đó ENVIRONMENT mất 4,9 phút (tự dựng
cụm PostgreSQL riêng ở cổng 55433), BUILD và các việc thêm mất 7,7 phút, tất cả chạy tuần tự. Trận 1TAKRYNC: đến
phút thứ 6 vẫn đang `initdb` một cụm PostgreSQL mới trong `%LOCALAPPDATA%\MTM\1TAKRYNC`. Máy chưa có
`D:\mtm\MLD\.mtm-local`, không có Postgres chạy thường trực; bản Postgres portable do agent tự tải về hôm 29/10.

| Thay đổi | Ở đâu |
|---|---|
| `docs/machine-setup.ps1` chạy MỘT LẦN trước ngày thi. Script dựng PostgreSQL thường trực ở cổng 5433 (dùng service nếu có; nếu không thì dùng bản portable có sẵn, thư mục dữ liệu cố định, tự bật khi đăng nhập Windows); tạo role theo `db-setup.sql`; ghi `.mtm-local\postgres.json` + `README.md`; cài pnpm đúng version; nạp sẵn kho package; cài Playwright Chromium | docs |
| Cấm tải hoặc cài PostgreSQL, `initdb` hay đổi cổng trong trận. Nếu máy chưa được chuẩn bị thì vẫn chạy được theo đường chậm, nhưng phải báo `MACHINE_NOT_PREPARED` | ENVIRONMENT "0", profile scout |
| B (build, test baseline) và C (cài đặt 3 slot) chạy song song ở nền, chờ một lần | ENVIRONMENT "0", B/C, SKILL bước 6 |
| Slot dùng chung database ứng dụng, chỉ database test riêng cho từng slot (đúng hướng dẫn trong env-require của Solova); nếu đề bắt buộc database riêng thì sao chép bằng `TEMPLATE` thay vì migrate và seed lại | ENVIRONMENT C, SKILL bước 5 |
| `pnpm install --prefer-offline` | ENVIRONMENT |
| Cache theo cây mã nguồn (`git rev-parse HEAD:<folder>`): repo map, tools và patch baseline của cùng một seed được dùng lại và chỉ kiểm tra lại, không viết từ đầu | ENVIRONMENT "0" |

Ước tính thời gian chuẩn bị: khoảng 5–7 phút với máy đã chạy machine-setup; khoảng 3–4 phút nếu trúng cache (cùng seed).
