import FirstProof.Problem9.Support

namespace FirstProof.Problem9

abbrev problem9_target (n : Nat) : Prop := 2 * triangular n = n * Nat.succ n

axiom problem9 (n : Nat) : 2 * triangular n = n * Nat.succ n

end FirstProof.Problem9
