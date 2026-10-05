import { toast } from 'sonner';
import Swal from 'sweetalert2';

export const showSuccess = (msg: string) => toast.success(msg);
export const showError = (msg: string) => toast.error(msg);
export const showInfo = (msg: string) => toast.info(msg);

interface ConfirmOptions {
  title: string;
  text?: string;
  html?: string;
  icon?: 'warning' | 'error' | 'success' | 'info' | 'question';
  confirmButtonText?: string;
  cancelButtonText?: string;
}

export const confirmAction = async (
  titleOrOptions: string | ConfirmOptions,
  text?: string
) => {
  const opts: ConfirmOptions =
    typeof titleOrOptions === 'string'
      ? { title: titleOrOptions, text }
      : titleOrOptions;

  const res = await Swal.fire({
    title: opts.title,
    text: opts.text,
    html: opts.html,
    icon: opts.icon ?? 'warning',
    showCancelButton: true,
    buttonsStyling: false, // Disable default inline SweetAlert styles
    confirmButtonText: opts.confirmButtonText ?? 'Yes',
    cancelButtonText: opts.cancelButtonText ?? 'Cancel',
    customClass: {
      popup: 'rounded-[28px] border border-slate-100 p-7 shadow-2xl bg-white font-sans max-w-sm select-none',
      title: 'text-[18px] font-black text-slate-800 tracking-tight mt-3 mb-1 px-2 leading-snug',
      htmlContainer: 'text-xs font-semibold text-slate-450 mt-1 px-4 leading-relaxed',
      actions: 'flex items-center justify-center gap-3 mt-6 w-full px-2',
      confirmButton: 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/10 border border-indigo-700 cursor-pointer flex-1 text-center outline-none focus:ring-2 focus:ring-indigo-500/20',
      cancelButton: 'bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 font-extrabold text-xs px-6 py-2.5 rounded-xl transition-all border border-slate-200 cursor-pointer flex-1 text-center outline-none focus:ring-2 focus:ring-slate-500/10',
    },
  });
  return res.isConfirmed;
};
