# team-sdlc-pack 1.5.5: sửa launcher job trên Windows (CVNXDTQY)

## Sự cố
CVNXDTQY (1.5.4) bị BLOCKED ở ENVIRONMENT. `start_jobs` khởi động được `prep-install`, nhưng `wait_jobs` báo
`LOST` ngay lập tức với log rỗng, kể cả với một lệnh chẩn đoán đơn giản. Scout đã thử và tìm ra: trên Windows, pwsh
chạy với `detached: true` (tiến trình không có console) thoát ngay với mã 0 mà không chạy gì. Cùng lệnh đó chạy với
`detached: false` thì bình thường. Trên Linux, nơi tôi test 1.5.4, lỗi này không xảy ra.

## Sửa
- **Runner Node tách rời:** `start_jobs` khởi động `node job-runner.mjs <dir> <name> <cwd>` dưới dạng tách rời. Node
  không cần console. Runner chạy pwsh như tiến trình con bình thường (console ẩn), ghi log, ghi mã thoát vào
  `<name>.exit`, và vẫn sống sau khi helper hay lượt Codex kết thúc. Nếu không chạy được `pwsh` thì runner thử
  `powershell.exe`.
- **Kiểm tra sau khởi động:** 1,5 s sau khi khởi động, job nào bị `LOST` được chạy lại dưới dạng tiến trình con
  trực tiếp của helper (`mode: "direct"`, đúng cách scout đã xác nhận là chạy được). Ở chế độ này, chính shell tự ghi
  `<name>.exit`, nên vẫn có mã thoát khi helper đã thoát.
- **Luật mới:** lỗi của bộ chạy job không bao giờ được làm BLOCK phần chuẩn bị. Nếu job vẫn LOST hoặc thoát 127, scout
  chạy lệnh đó trực tiếp bằng `exec_command` rồi làm tiếp. BLOCKED chỉ dành cho lỗi môi trường thật (database, cài
  đặt, build).

## Kiểm thử
- `tests/jobs.test.mjs`: 2/2.
  - Test mới mô phỏng đúng lỗi Windows: runner chết ngay mà không ghi gì (`MTM_JOB_RUNNER_BROKEN=1`). Kết quả: cả hai
    job chuyển sang `direct` và kết thúc DONE, có log.
- Đã thử thủ công: job chạy qua runner vẫn sống sau khi tiến trình helper thoát (mã thoát 0, log "survived").
- Wrapper pwsh của Windows được chạy bằng pwsh thật với 3 lệnh (exit 4 của lệnh native, cmdlet, throw), có và không
  có file exit: mã thoát và file đều đúng (4/0/1).
- Các test còn lại pass. `check-distribution`: READY 1.5.5. Installer có chép `job-runner.mjs`.

## Chưa kiểm chứng trên Windows
Tôi chưa chạy được runner Node tách rời trên Windows. Nếu Windows cũng làm nó chết, kiểm tra 1,5 s sẽ chuyển job sang
chế độ direct. Chế độ này scout đã xác nhận chạy được trong CVNXDTQY.
