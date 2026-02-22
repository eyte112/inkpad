import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';

/**
 * 格式化日期
 */
export function formatDate(date: string | Date, pattern?: string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern || 'yyyy年M月d日', { locale: zhCN });
}

/**
 * 格式化日期时间
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy年M月d日 HH:mm', { locale: zhCN });
}

/**
 * 相对时间 (如 "3 分钟前")
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
}

/**
 * 格式化过期时间
 */
export function formatExpiryDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const now = new Date();

  if (d < now) {
    return '已过期';
  }

  const diff = d.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return '今天过期';
  } else if (days === 1) {
    return '明天过期';
  } else if (days < 7) {
    return `${days} 天后过期`;
  } else {
    return formatDate(d, 'yyyy年M月d日');
  }
}
