import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
	children: ReactNode;
	content: ReactNode;
	side?: 'top' | 'right' | 'bottom' | 'left';
	delayDuration?: number;
}

export function TooltipProvider({ children }: { children: ReactNode }) {
	return (
		<TooltipPrimitive.Provider delayDuration={200}>
			{children}
		</TooltipPrimitive.Provider>
	);
}

export function Tooltip({ children, content, side = 'bottom', delayDuration }: TooltipProps) {
	return (
		<TooltipPrimitive.Root delayDuration={delayDuration}>
			<TooltipPrimitive.Trigger asChild>
				{children}
			</TooltipPrimitive.Trigger>
			<TooltipPrimitive.Portal>
				<TooltipPrimitive.Content className={styles.content} side={side} sideOffset={5}>
					{content}
					<TooltipPrimitive.Arrow className={styles.arrow} width={10} height={5} />
				</TooltipPrimitive.Content>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	);
}
