# team-sdlc-pack 1.5.3: sửa mâu thuẫn, deadline do helper canh

Bản này không thêm luật mới. Nó chuyển ba việc mà prompt không làm được sang code, và viết lại những câu luật mâu
thuẫn nhau trong 1.5.2.

## Code (helper)
| Thay đổi | Trước (1.5.2) | Sau (1.5.3) |
|---|---|---|
| Canh deadline | Không có. Safety net bảo "chờ ~60 s" nhưng `wait_for_update` luôn chặn 240 s, nên item còn 3 phút sẽ đóng trong lúc orchestrator đang chờ. | `wait_for_update` trả `reason: "DEADLINE_SOON"` với `deadlineSoon[]` (`backlogItemKey`, `slot`, `kind` DEADLINE/MATCH_END, `minutesLeft`). Mỗi item đang làm được báo một lần khi còn 3 phút tới deadline, và một lần khi còn 3 phút tới hết trận. Trong 5 phút sau đó, `timeoutMs` ngắn được tôn trọng (chờ DONE.json khoảng 60 s). |
| Đồng hồ | Mô hình tự tính deadline. | Board có `items[].minutesLeft` và `match.minutesLeft`, tính từ `match.elapsedSec` / `remainingSec` và `revealedElapsedSec` của Game Master (có trừ thời gian trôi kể từ lần đọc). Không có các trường này thì dùng lúc helper thấy item lần đầu. |
| Board gọn | Mỗi item kèm tới 400 ký tự mô tả, khoảng 4–5k token mỗi lần chờ với 10 item, dồn vào context orchestrator. | Bỏ `description` và text dài hơn 160 ký tự. Còn khóa, loại, tiêu đề, điểm, deadline, trạng thái, `submitted`, `minutesLeft`. Test: board dưới 2000 ký tự. |
| Slot riêng cho orchestrator | Orchestrator tự làm PI ngay trong main checkout, nên mọi `integrate_item` của worker bị kẹt (`MAIN_DIRTY`). | `prepare_slots` nhận `count` tối đa 4: s1–s3 cho worker, **s4** (`role: orchestrator`) cho item orchestrator tự làm. `start_work`, `release_slot` nhận `s4`. Main checkout luôn sạch. |
| Mô tả `wait_for_update` | Vừa ghi "timeoutMs bị bỏ qua", vừa ghi "timeout ngắn được tôn trọng khi worker bận". | Khớp với code. |

## Luật (skills, agents)
| # | Mâu thuẫn trong 1.5.2 | Sửa |
|---|---|---|
| 1 | Safety net "chờ ~60 s" không chạy được | Mục "Safety net (on DEADLINE_SOON)": nhắn worker commit, `wait_for_update {timeoutMs: 60000}`, chưa có DONE.json thì `integrate_item` với `allowUncommitted`. |
| 2 | TASK hỏi giá trị: "luôn chạy code" | Hỏi "code tính ra gì" thì chạy code. Hỏi "giá trị đúng theo chuẩn" thì tính theo chuẩn KB hiện hành rồi đối chiếu với code; khác nhau thì chuẩn thắng (bẫy cascade). |
| 3 | Orchestrator làm PI trong main checkout | Làm trong s4, kết thúc bằng doneFile và `integrate_item`. Main checkout chỉ dùng khi không có slot nào. |
| 4 | PI: "minimal fix" và "No code change" | Chỉ sửa code khi brief yêu cầu. |
| 5 | CR "chỉ viết test nếu brief yêu cầu" và kind 1 "bắt buộc viết bảng luật" | Hidden/organizer test được nhắc ở bất cứ đâu (brief, file MVS, tiêu chí) thì làm bảng luật và một test cho mỗi luật, mỗi biên. |
| 6 | Mẫu spawn message vẫn là "Group …" của 1.4.0 | Mẫu một item. Mục "Groups" trong WORKER đổi thành "Next item in the same slot (rare)". |
| 7 | File agent orchestrator: send_message/followup_task hẹp hơn SKILL | Liệt kê đúng các trường hợp: safety net, ghi chú "blocker đã lên nhánh"; followup cho gate, item `next`, giá trị placeholder. |
| 8 | Orchestrator gọi Company Tools cho mọi item, worker cũng tự gọi | Worker tự gọi qua relay; orchestrator chỉ lấy QA data lúc giao việc và khi tự làm item. |
| 9 | WORKER "nếu không gọi được company tool thì ghi doubts" (lỗi thời từ 1.5.0) | Worker tự gọi. |
| 10 | LESSONS "wave ở phút 0/14/29, làm xong wave rồi chờ" | Format chính thức 0/8/12/20, wave chồng nhau, giữ mọi slot bận. |
| 11 | "Không chạy cả suite" và "chạy cả suite một lần nếu tiêu chí yêu cầu" | Chỉ chạy cả suite khi tiêu chí yêu cầu, một lần, ở cuối. |
| 12 | Comment config "1.3.0, low effort" | Ghi rõ chính sách model của Player có thể ghi đè. |

Thêm: preparation tạo 4 slot; recovery xử lý s4 (không spawn worker cho s4); s4 không bao giờ được tính là "slot rảnh"
để spawn worker.

## Kiểm thử
- `tests/deadline.test.mjs` (mới): `minutesLeft` của item và trận đúng; board không có mô tả, dưới 2000 ký tự; s4
  có `role: orchestrator`; `start_work` vào s4; `DEADLINE_SOON` đến ngay (dưới 8 s) và đúng một lần; sau đó
  `timeoutMs: 5000` được tôn trọng; khi trận còn 2,5 phút có thêm một `DEADLINE_SOON` loại MATCH_END; lần chờ sau
  là thay đổi thật (`MATCH_UPDATED`).
- `helper`, `slots`, `groups`: pass (test slot sửa `count: 4` thành `count: 5` cho trường hợp lỗi).
- `check-distribution`: READY, 1.5.3, 15 tool.
- Audit 76 cụm luật: 73 còn. 3 cụm bỏ có chủ đích: "consult … for every item" (worker tự gọi), "≤ 3 minutes" (thay
  bằng DEADLINE_SOON), "MVS is only the minimum" (bỏ từ 1.3.2).

## Bộ chạy thử (harness)
Game Master giả trả thêm `elapsedSec`, `configuredDurationSec`, `remainingSec`, `revealedElapsedSec` giống Game
Master thật, để `DEADLINE_SOON` hoạt động trong lần chạy thử.

## Chưa kiểm chứng
- Tên trường đồng hồ lấy từ transcript trận luyện tập VREGZAVG (`elapsedSec`, `remainingSec`,
  `revealedElapsedSec`). Nếu trận chính thức đổi tên, helper dùng mốc "lần đầu thấy item". Mốc này muộn hơn lúc
  item mở đúng bằng độ trễ helper nhìn thấy nó (thường vài giây), nên cảnh báo có thể đến muộn chừng ấy.
- Slot s4 thêm một lần `pnpm install` trong preparation (chạy song song với các slot khác).
