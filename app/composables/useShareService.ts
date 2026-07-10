export type ShareServiceResult =
  | 'shared'
  | 'copied'
  | 'cancelled'
  | 'failed';

export interface ShareServiceInput {
  title: string;
  text: string;
  url: string;
  imageUrl?: string;
}

function preparedText(input: ShareServiceInput): string {
  return `${input.text.trim()}\n\n${input.url}`;
}

async function loadShareImage(imageUrl: string): Promise<File | null> {
  if (typeof fetch !== 'function' || typeof File === 'undefined') return null;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], 'glasno.png', {
      type: blob.type || 'image/png',
    });
  } catch {
    return null;
  }
}

async function copyPreparedText(value: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // В старых WebView Clipboard API может существовать, но быть запрещён.
    }
  }

  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export async function shareServiceContent(
  input: ShareServiceInput
): Promise<ShareServiceResult> {
  const textWithUrl = preparedText(input);
  const browserNavigator =
    typeof navigator === 'undefined' ? null : navigator;

  if (browserNavigator?.share) {
    try {
      const image = input.imageUrl
        ? await loadShareImage(input.imageUrl)
        : null;
      const files = image ? [image] : [];

      if (
        files.length &&
        browserNavigator.canShare?.({ files })
      ) {
        // При отправке файла URL дублируем в тексте: часть desktop-целей
        // игнорирует поле url в сочетании с files.
        await browserNavigator.share({
          title: input.title,
          text: textWithUrl,
          files,
        });
      } else {
        await browserNavigator.share({
          title: input.title,
          text: input.text,
          url: input.url,
        });
      }
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return 'cancelled';
      }
      // После ошибки системного окна оставляем пользователю рабочий fallback.
    }
  }

  return (await copyPreparedText(textWithUrl)) ? 'copied' : 'failed';
}
