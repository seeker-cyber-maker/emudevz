# Suggested Improvements for your Emulator

Congratulations on making it this far! Now that you have full control over the emulator and can change everything as you see fit, there are many areas you can improve it. The improvements don't even have to rip out the components you built throughout the game, either, as the emulator you created is surprisingly capable. It may not be the most accurate, but don't underestimate both it and yourself! Many games will work correctly as long as you get the mapper emulation right.

Here are some suggested improvements you can make to the emulation without major changes to the overall emulator architecture:

### Input

- `Controller.js`: In your `onRead()` function, you can modify the return value to allow more games to read the controller. Some games won't respond to inputs with how your controller is likely currently implemented. The previous chapters didn't touch on it much, but there's a concept called `open bus`, which means that certain bits in a byte can be garbage or nonsense when reading them back, due to nothing being connected to those bits. In the case of controller input, recall that only the first bit (bit 0) was used. That works fine for 99% of games, but a small handful rely on seeing open bus when reading from the controller ports. The high byte of the address is typically the last thing on the bus, so in many (but not all) cases, that is also what is used for open bus. In the case of controller input, since that involves reading from `$4016` and `$4017`, open bus for these is `$40/0x40`. By adding this to your controller emulation, you should see games involving `people delivering newspapers`, `an angry person named Max`, and a small handful of others now accept input! A simple implementation of this might look like: `return 0x40 | +isPressed;`.

### Interrupts

In the post-game, you can add as many mappers for the NEEES as you wish. However, as you implement APU IRQs, improve the accuracy of when your PPU sends NMI, or add more complex mappers that send their own IRQs, like MMC3, you'll find that the way your emulator sends interrupts to the CPU is very simple and may not be sufficient to handle all of these. Multiple devices can send IRQs to the CPU: the APU (this can send two different IRQs!), the mapper (typically CPU cycle counters or scanline counters), and of course, the CPU itself when BRK is executed.

To handle all of these, along with NMI and RESET, you may want to consider rewriting how the Emulator class sends interrupts. The Emulator class provides several `onIntr` methods within `_clockAPU`, `_clockPPU`, and so on, but they immediately detour the CPU into an interrupt when it may not be the best time to do it. Instead, consider having these `onIntr` methods "queue up" interrupts for the CPU to handle at its leisure, with a priority system.

Suggested interrupt priorities, highest-to-lowest, and who should handle acknowledging them:

| Interrupt               | Who acknowledges it                                        | Priority (lower is higher) |
| ----------------------- | ---------------------------------------------------------- | -------------------------- |
| RESET                   | CPU                                                        | 0                          |
| NMI                     | CPU                                                        | 1                          |
| BRK (IRQ)               | CPU                                                        | 2                          |
| APU Frame counter (IRQ) | APU registers (when written by the CPU)                    | 3                          |
| APU DMC finished (IRQ)  | APU registers (when written by the CPU)                    | 4                          |
| Mapper (IRQ)            | Mapper (when the CPU writes to a mapper-specific register) | 5                          |

By sending interrupts this way, it also allows for more accurate emulation of mapper IRQs, because games can tell the mapper or other hardware that the interrupts were handled and/or cancelled. On the real NEEES, devices would send their interrupt signal constantly otherwise. Handling interrupts this way would also allow for your PPU to schedule an NMI on cycle 1 of VBlank as intended, instead of cycle 0, like an earlier chapter directed you to.

This suggestion list won't provide a full tutorial, but consider adding something like a pseudo-register to your CPU called `PendingInterrupts`, which keeps track of what IRQs are pending. This can be done with `InMemoryRegister` to keep track of all of them, or one boolean for each interrupt source: Reset, NMI, BRK, APU frame, APU DMC, and the mapper. Then provide simple methods like `raise(id)` and `acknowledge(id)` that set and clear those booleans. Then, back in your CPU's `step()` method, instead of returning `this._addCycles(operation)`, return a method like `this.checkInterrupts(cycles)` instead. In that method, see which interrupt of the highest priority is ready to go, and if any are, have your CPU take the interrupt (`this.interrupt`) and return the `cycles` parameter, modifying it if the interrupt was taken.

Of course, there are many ways of handling pending interrupts and acknowledging them, so feel free to learn and experiment! Internal devices were chosen to be the top priorities for this example.

### PPU

There are many areas in which the PPU can be improved upon as well. However, such a topic would be far too exhaustive and out of scope for this small suggestions document. Instead, here are two short examples of things that can be improved:

- Dummy tiles in `BackgroundRenderer`: The real NEEES's PPU actually fetches more than 32 tiles per scanline, but doesn't do much with them, and some mappers like MMC2 and MMC4 look for these! For simplicity, the previous chapters only fetched 32. By doing these otherwise unused fetches, it will allow certain games using MMC2 and MMC4 to function without graphical glitches. In `BackgroundRenderer::renderScanline`, have the loop continue to `x < 272` and only plot background pixels when `x < 256` (let the loop still do everything else, no further changes needed). Upon doing this, you'll notice that the game involving `an underdog who aspires to be the top boxer` should no longer have a corrupted/glitched boxing ring!

- `SpriteRenderer`: If you end up improving your PPU so the `boxing game` will run, there's one small change you'll want to make to sprite rendering. You'll notice that the opponent boxer will turn into a scrambled mess of glitched tiles when they perform their special attacks. To correct this, you can simply stop the `_evaluate` function from returning a reversed list of sprites. However! This creates problems in other games, like the `third plumber game`, which wants the sprite list reversed so it can put enemies behind pipes, to create the illusion of enemies rising up from them. So, to reconcile this, you might want to either:
    - Rewrite sprite rendering entirely to improve accuracy, or:
    - (Note that this is a hack and not accurate!) Write a small method that returns true if the mapper ID is 9 or 10, and then use that result to conditionally reverse the sprite list or not.

If you opt to write the small method, that would allow your current PPU to display the opponent boxer correctly without needing to perform major refactoring or rewriting of the PPU you wrote during the course of the game. It would also allow the `third plumber game` and others to display correctly.


### APU

You may have noticed in some games that use DPCM/DMC samples that there is garbled static or noise in some cases. To correct this, edit `/lib/DPCM.js` and add `this.isActive = false` to the `stop()` method. This is most easily tested in the `boxing game`: when the crowd stops cheering, you'll easily hear a static buzzing sound without this tweak.
