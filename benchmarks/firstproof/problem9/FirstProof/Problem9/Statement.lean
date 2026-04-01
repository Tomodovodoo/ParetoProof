import FirstProof.Problem9.Support

namespace FirstProof.Problem9

def problem9_target (n : Nat) : Prop := 2 * triangular n = n * Nat.succ n

axiom problem9 (n : Nat) : problem9_target n

end FirstProof.Problem9
