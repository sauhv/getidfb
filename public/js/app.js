const btnGet = document.getElementById("btn");
const textarea = document.getElementById("urls");
const resultarea = document.getElementById("resultarea");
const resultList = document.getElementById("resultList");

btnGet.addEventListener("click", async () => {
  const raw = textarea.value.trim();
  if (!raw) {
    alert("Vui lòng nhập ít nhất một URL!");
    return;
  }
  const urls = raw
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);

  resultarea.textContent = "Đang xử lý... Vui lòng chờ.";
  resultList.innerHTML = "";

  try {
    const res = await fetch("/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });

    if (!res.ok) {
      const err = await res.json();
      resultarea.textContent = "Lỗi server: " + (err.error || "Unknown error");
      return;
    }

    const data = await res.json();

    // Tạo li với nút copy riêng biệt
    const li = data
      .map((item) => {
        let content = item.result
          ? item.result
          : item.error
          ? `${item.url} - ⚠️ ${item.error}`
          : JSON.stringify(item);

        return `
                <li class="result-item">
                  <span class="result-text">${content}</span>
                  <button class="btnCopy" title="Copy"><i class="fas fa-copy"></i></button>
                </li>
              `;
      })
      .join("");

    resultList.innerHTML = li;
    resultarea.innerHTML = "<code>Nhớ cho tui 10k nhé iu!!!</code>";

    // Gán sự kiện click cho từng nút copy
    const copyButtons = resultList.querySelectorAll(".btnCopy");
    copyButtons.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation(); // Ngăn click chạm vào li
        const li = btn.closest(".result-item");
        const text = li.querySelector(".result-text").textContent.trim();

        navigator.clipboard
          .writeText(text)
          .then(() => {
            li.classList.add("copied");
              btn.textContent = "Copied!";
            // setTimeout(() => li.classList.remove("copied"), 1500);
          })
          .catch(() => alert("Copy thất bại!"));
      });
    });

    // Gán sự kiện click cho từng dòng li
    const resultItems = resultList.querySelectorAll(".result-item");
    resultItems.forEach((item) => {
      item.addEventListener("click", () => {
        navigator.clipboard.writeText(
          item.querySelector(".result-text").textContent.trim()
        );
        const copyBtn = item.querySelector(".btnCopy");
        if (copyBtn) {
            item.classList.add("copied");
            copyBtn.textContent = "Copied!";
          }
        // setTimeout(() => item.classList.remove("copied"), 1500);
      });
    });
  } catch (err) {
    resultarea.textContent = "Lỗi kết nối hoặc xử lý: " + err.message;
  }
});
