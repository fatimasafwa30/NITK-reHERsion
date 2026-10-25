import * as RTooltip from '@radix-ui/react-tooltip';

export function TooltipProvider({ children }) {
  return (
    <RTooltip.Provider delayDuration={250} skipDelayDuration={400}>
      {children}
    </RTooltip.Provider>
  );
}

export function Tooltip({ label, children, side = 'top' }) {
  return (
    <RTooltip.Provider delayDuration={250} skipDelayDuration={400}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content
            side={side}
            sideOffset={6}
            className="anim-pop z-80 max-w-56 rounded-sm border border-lilac bg-paper px-2.5 py-1.5 text-xs leading-relaxed text-plum shadow-sheet"
            data-print="hide"
          >
            {label}
            <RTooltip.Arrow className="fill-paper" width={10} height={5} />
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}
