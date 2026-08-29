import type { ComponentProps } from 'react';
import { Pressable } from 'react-native';

export function AppPressable({ style, ...props }: ComponentProps<typeof Pressable>) {
  return (
    <Pressable
      accessibilityRole={props.accessibilityRole ?? 'button'}
      {...props}
      style={(state) => [
        { minHeight: 44, minWidth: 44 },
        typeof style === 'function' ? style(state) : style,
        state.pressed && { opacity: 0.72 }
      ]}
    />
  );
}
