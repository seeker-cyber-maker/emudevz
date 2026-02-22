# CPU: Instructions

#### Reference

- 🚫: The instruction receives `"no"` _arguments_.
- 🐏: The instruction receives a memory `"address"` as _argument_.
- 🔢: The instruction receives a `"value"` as _argument_.

#### 🧮 Arithmetic

| Code   | Name                                | Arg | Description                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | ----------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADC`  | Add with Carry                      | 🔢  | Adds the contents of a `value` to `[A]` together with the Carry flag (`[A]` = `[A]` + `value` + `C`), also updating the `Z` and `N` flags.<br><br>The `C` and `V` flags are set in case of unsigned and signed overflow respectively.<br><br>Unsigned overflow occurs when the result is >= `256` (use `byte.overflows(...)`).<br>Signed overflow occurs when `Positive + Positive = Negative` or `Negative + Negative = Positive`. |
| `ASL`  | Arithmetic Shift Left               | 🐏  | Shifts all the bits of the value held at an `address` one place to the left. Bit `7` is placed in the `C` flag and bit `0` is set to `0`.<br><br><div class="embed-image"><img alt="ASL" src="assets/bitshifts/ASL.gif" width="186" height="115" /></div><br>The `Z` and `N` flags are updated using the result.                                                                                                                    |
| `ASLa` | Arithmetic Shift Left (Accumulator) | 🚫  | Like `ASL`, but works with `[A]` instead of a memory address.                                                                                                                                                                                                                                                                                                                                                                       |
| `DEC`  | Decrement Memory                    | 🐏  | Subtracts one from the value held at an `address`, also updating the `Z` and `N` flags.                                                                                                                                                                                                                                                                                                                                             |
| `DEX`  | Decrement X Register                | 🚫  | Subtracts one from `[X]`, also updating the `Z` and `N` flags.                                                                                                                                                                                                                                                                                                                                                                      |
| `DEY`  | Decrement Y Register                | 🚫  | Subtracts one from `[Y]`, also updating the `Z` and `N` flags.                                                                                                                                                                                                                                                                                                                                                                      |
| `INC`  | Increment Memory                    | 🐏  | Adds one to the value held at an `address`, also updating the `Z` and `N` flags.                                                                                                                                                                                                                                                                                                                                                    |
| `INX`  | Increment X Register                | 🚫  | Adds one to `[X]`, also updating the `Z` and `N` flags.                                                                                                                                                                                                                                                                                                                                                                             |
| `INY`  | Increment Y Register                | 🚫  | Adds one to `[Y]`, also updating the `Z` and `N` flags.                                                                                                                                                                                                                                                                                                                                                                             |
| `LSR`  | Logical Shift Right                 | 🐏  | Shifts all the bits of the value held at an `address` one place to the right. Bit `0` is placed in the `C` flag and bit `7` is set to `0`.<br><br><div class="embed-image"><img alt="LSR" src="assets/bitshifts/LSR.gif" width="186" height="115"/></div><br>The `Z` and `N` flags are updated using the result.                                                                                                                    |
| `LSRa` | Logical Shift Right (Accumulator)   | 🚫  | Like `LSR`, but works with `[A]` instead of a memory address.                                                                                                                                                                                                                                                                                                                                                                       |
| `ROL`  | Rotate Left                         | 🐏  | Moves all the bits of the value held at an `address` one place to the left. Bit `7` is placed in the `C` flag and bit `0` is filled with the old value of the `C` flag.<br><br><div class="embed-image"><img alt="ROL" src="assets/bitshifts/ROL.gif" width="186" height="115" /></div><br>The `Z` and `N` flags are updated using the result.                                                                                      |
| `ROLa` | Rotate Left (Accumulator)           | 🚫  | Like `ROL`, but works with `[A]` instead of a memory address.                                                                                                                                                                                                                                                                                                                                                                       |
| `ROR`  | Rotate Right                        | 🐏  | Moves all the bits of the value held at an `address` one place to the right. Bit `0` is placed in the `C` flag and bit `7` is filled with the old value of the `C` flag.<br><br><div class="embed-image"><img alt="ROR" src="assets/bitshifts/ROR.gif" width="186" height="115" /></div><br>The `Z` and `N` flags are updated using the result.                                                                                     |
| `RORa` | Rotate Right (Accumulator)          | 🚫  | Like `ROR`, but works with `[A]` instead of a memory address.                                                                                                                                                                                                                                                                                                                                                                       |
| `SBC`  | Subtract with Carry                 | 🔢  | Subtracts the contents of a `value` from `[A]` together with the `not` of the Carry flag.<br><br>The `Z`, `N`, `C` (set if there was no borrow), and `V` (set when sign is wrong) flags are updated.<br><br>It can be implemented as an `ADC` call with the negative representation of `value` - 1.<br>Ex:<br>`SBC(cpu, value) { ADC(cpu, 256 - value - 1) }`                                                                       |

#### 📈 Data

| Code  | Name                        | Arg | Description                                                                  |
| ----- | --------------------------- | --- | ---------------------------------------------------------------------------- |
| `CLC` | Clear Carry Flag            | 🚫  | Sets `C` = `0`.                                                              |
| `CLD` | Clear Decimal Mode          | 🚫  | Sets `D` = `0`.                                                              |
| `CLI` | Clear Interrupt Disable     | 🚫  | Sets `I` = `0`.                                                              |
| `CLV` | Clear Overflow Flag         | 🚫  | Sets `V` = `0`.                                                              |
| `LDA` | Load Accumulator            | 🔢  | Loads a `value` into `[A]`, also updating the `Z` and `N` flags.             |
| `LDX` | Load X Register             | 🔢  | Loads a `value` into `[X]`, also updating the `Z` and `N` flags.             |
| `LDY` | Load Y Register             | 🔢  | Loads a `value` into `[Y]`, also updating the `Z` and `N` flags.             |
| `PHA` | Push Accumulator            | 🚫  | Pushes `[A]` onto the stack.                                                 |
| `PHP` | Push Processor Status       | 🚫  | Pushes the flags (as a byte, with bit `4` set) onto the stack.               |
| `PLA` | Pull Accumulator            | 🚫  | Pulls a byte from the stack into `[A]`, also updating the `Z` and `N` flags. |
| `PLP` | Pull Processor Status       | 🚫  | Pulls a byte from the stack into the flags register.                         |
| `SEC` | Set Carry Flag              | 🚫  | Sets `C` = `1`.                                                              |
| `SED` | Set Decimal Flag            | 🚫  | Sets `D` = `1`.                                                              |
| `SEI` | Set Interrupt Disable       | 🚫  | Sets `I` = `1`.                                                              |
| `STA` | Store Accumulator           | 🐏  | Stores the contents of `[A]` into an `address`.                              |
| `STX` | Store X Register            | 🐏  | Stores the contents of `[X]` into an `address`.                              |
| `STY` | Store Y Register            | 🐏  | Stores the contents of `[Y]` into an `address`.                              |
| `TAX` | Transfer Accumulator to X   | 🚫  | Copies `[A]` into `[X]`, also updating the `Z` and `N` flags.                |
| `TAY` | Transfer Accumulator to Y   | 🚫  | Copies `[A]` into `[Y]`, also updating the `Z` and `N` flags.                |
| `TSX` | Transfer Stack Pointer to X | 🚫  | Copies `[SP]` into `[X]`, also updating the `Z` and `N` flags.               |
| `TXA` | Transfer X to Accumulator   | 🚫  | Copies `[X]` into `[A]`, also updating the `Z` and `N` flags.                |
| `TXS` | Transfer X to Stack Pointer | 🚫  | Copies `[X]` into `[SP]`, **WITHOUT** updating any flag.                     |
| `TYA` | Transfer Y to Accumulator   | 🚫  | Copies `[Y]` into `[A]`, also updating the `Z` and `N` flags.                |

#### ✅ Checks

| Code  | Name                 | Arg | Description                                                                                                                                                                                                                                                             |
| ----- | -------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BIT` | Bit Test             | 🔢  | Tests if one or more bits are set in a `value`.<br><br>The `Z` flag is updated so it's set if the value ANDed with the `[A]` register is `0` (`Z` = (`value` & `[A]`) == `0`).<br><br>Bits `7` and `6` of the value are copied into the `N` and `V` flags respectively. |
| `CMP` | Compare              | 🔢  | Compares `[A]` with a `value`, updating `Z`, `N` and `C` as follows:<br><br>`Z` = `[A]` == `value`<br>`N` = (whether bit `7` of (`[A]` - `value`) is set)<br>`C` = `[A]` >= `value`                                                                                                           |
| `CPX` | Compare X Register   | 🔢  | Compares `[X]` with a `value`, updating `Z`, `N` and `C` as follows:<br><br>`Z` = `[X]` == `value`<br>`N` = (whether bit `7` of (`[X]` - `value`) is set)<br>`C` = `[X]` >= `value`                                                                                                           |
| `CPY` | Compare Y Register   | 🔢  | Compares `[Y]` with a `value`, updating `Z`, `N` and `C` as follows:<br><br>`Z` = `[Y]` == `value`<br>`N` = (whether bit `7` of (`[Y]` - `value`) is set)<br>`C` = `[Y]` >= `value`                                                                                                           |
| `AND` | Logical AND          | 🔢  | Performs a "bit by bit" logical AND between `[A]` and a `value` (`[A]` & `value`), storing the result in `[A]` and updating the `Z` and `N` flags.                                                                                                                      |
| `EOR` | Exclusive OR         | 🔢  | Performs a "bit by bit" exclusive OR between `[A]` and a `value` (`[A]` ^ `value`), storing the result in `[A]` and updating the `Z` and `N` flags.                                                                                                                     |
| `ORA` | Logical Inclusive OR | 🔢  | Performs a "bit by bit" logical inclusive OR between `[A]` and a `value` (`[A]` \| `value`), storing the result in `[A]` and updating the `Z` and `N` flags.                                                                                                            |

#### 🔀 Branching

| Code  | Name                     | Arg | Description                                                                                             |
| ----- | ------------------------ | --- | ------------------------------------------------------------------------------------------------------- |
| `BCC` | Branch if Carry Clear    | 🐏  | If the `C` flag is clear, jumps to an `address` **(\*)**.                                                        |
| `BCS` | Branch if Carry Set      | 🐏  | If the `C` flag is set, jumps to an `address` **(\*)**.                                                          |
| `BEQ` | Branch if Equal          | 🐏  | If the `Z` flag is set, jumps to an `address` **(\*)**.                                                          |
| `BMI` | Branch if Minus          | 🐏  | If the `N` flag is set, jumps to an `address` **(\*)**.                                                          |
| `BNE` | Branch if Not Equal      | 🐏  | If the `Z` flag is clear, jumps to an `address` **(\*)**.                                                        |
| `BPL` | Branch if Positive       | 🐏  | If the `N` flag is clear, jumps to an `address` **(\*)**.                                                        |
| `BVC` | Branch if Overflow Clear | 🐏  | If the `V` flag is clear, jumps to an `address` **(\*)**.                                                        |
| `BVS` | Branch if Overflow Set   | 🐏  | If the `V` flag is set, jumps to an `address` **(\*)**.                                                          |
| `JMP` | Jump                     | 🐏  | Jumps to an `address`.                                                                                  |
| `JSR` | Jump to Subroutine       | 🐏  | Pushes the current `[PC]` (minus one) onto the stack and jumps to an `address`.                         |
| `RTI` | Return from Interrupt    | 🚫  | Pulls a byte from the stack into the flags register, then pulls a 16-bit value and stores it in `[PC]`. |
| `RTS` | Return from Subroutine   | 🚫  | Pulls a 16-bit value from the stack, and stores that value (plus one) in `[PC]`.                        |

<br />

**(\*)** All **conditional** branching instructions must increment `cpu.extraCycles` if they branch, or assign it to `0` otherwise. This doesn't apply to instructions that always jump (like `JMP`, `JSR`, `RTI`, or `RTS`).

#### 🧙‍♂️ System

| Code  | Name            | Arg | Description                                                                                                                                                                                |
| ----- | --------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BRK` | Force Interrupt | 🚫  | Increments `[PC]` and forces the generation of a software interrupt.<br><br>The `[PC]` and flags (with bit `4` set) are pushed onto the stack, then the `BRK` interrupt vector at `$FFFE/F` is loaded into `[PC]`. |
| `NOP` | No Operation    | 🚫  | Causes no changes at all.                                                                                                                                                                  |
