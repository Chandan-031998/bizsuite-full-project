import api, { warmUpServer } from "../api/axios.js";

const getFilenameFromDisposition = (cd) => {
  if (!cd) return null;
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(cd);
  return decodeURIComponent(m?.[1] || m?.[2] || "").trim() || null;
};

export async function downloadInvoicePdf(invoiceId) {
  try {
    // helps Render cold start (warmUpServer safely ignores failures)
    await warmUpServer();

    const res = await api.get(`/accounts/invoices/${invoiceId}/pdf`, {
      responseType: "blob",
      timeout: 120000,
      headers: { Accept: "application/pdf" },
    });

    const blob = new Blob([res.data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);

    const cd = res.headers?.["content-disposition"];
    const filename = getFilenameFromDisposition(cd) || `invoice-${invoiceId}.pdf`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("PDF download failed:", err?.response?.data || err?.message);

    // optional: show friendly alert/toast
    alert(
      err?.response?.status === 401
        ? "Session expired. Please login again."
        : "Failed to download invoice PDF. Please try again."
    );
  }
}
