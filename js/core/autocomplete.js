// Автодополнение для C# и Unity. Словарь ключевых слов и утилиты.
//
// Используется двумя механизмами:
//   1. Кастомная клавиатура — ряд подсказок над кнопками.
//   2. Физическая клавиатура — inline ghost-текст в редакторе.
//
// Слова отфильтровываются по префиксу (≥ MIN_PREFIX символов),
// регистронезависимо. Идентификатор под курсором собирается регуляркой
// [A-Za-z0-9_], что покрывает 99% C#-кода.

const MIN_PREFIX = 3;
const WORD_CHAR = /[A-Za-z0-9_]/;

// Ключевые слова C#: типы, модификаторы, управляющие конструкции,
// которые часто встречаются в скриптах Unity.
const CSHARP = [
  // Типы
  "bool", "byte", "char", "decimal", "double", "float", "int", "long",
  "object", "sbyte", "short", "string", "uint", "ulong", "ushort",
  "var", "void", "dynamic",
  // Значения
  "true", "false", "null", "this", "base", "default", "value",
  // Модификаторы
  "public", "private", "protected", "internal", "static", "readonly",
  "const", "sealed", "abstract", "virtual", "override", "new",
  "partial", "extern", "unsafe", "volatile", "async", "required",
  // Классы и члены
  "class", "struct", "interface", "enum", "record", "delegate",
  "namespace", "using", "event", "operator",
  "get", "set", "init", "where", "when",
  // Управление
  "if", "else", "switch", "case", "default", "for", "foreach",
  "while", "do", "break", "continue", "return", "yield",
  "throw", "try", "catch", "finally", "lock", "goto", "checked",
  "unchecked", "fixed", "stackalloc", "sizeof", "typeof", "nameof",
  "is", "as", "in", "out", "ref", "params", "implicit", "explicit",
  "await", "from", "select",
];

// Unity: MonoBehaviour-события, часто используемые типы и API.
const UNITY = [
  // MonoBehaviour-события
  "Awake", "Start", "Update", "FixedUpdate", "LateUpdate",
  "OnEnable", "OnDisable", "OnDestroy", "OnApplicationQuit",
  "OnCollisionEnter", "OnCollisionEnter2D", "OnCollisionExit", "OnCollisionExit2D",
  "OnCollisionStay", "OnCollisionStay2D",
  "OnTriggerEnter", "OnTriggerEnter2D", "OnTriggerExit", "OnTriggerExit2D",
  "OnTriggerStay", "OnTriggerStay2D",
  "OnGUI", "OnDrawGizmos", "OnDrawGizmosSelected",
  "OnMouseDown", "OnMouseUp", "OnMouseEnter", "OnMouseExit",
  "OnBecameVisible", "OnBecameInvisible",
  "OnValidate", "OnBeforeTransformParentChanged", "OnTransformParentChanged",

  // Типы
  "GameObject", "Transform", "Vector2", "Vector3", "Vector4",
  "Quaternion", "Color", "Color32", "Rect", "Bounds",
  "MonoBehaviour", "ScriptableObject", "Object",
  "Rigidbody", "Rigidbody2D", "Collider", "Collider2D",
  "BoxCollider", "BoxCollider2D", "CircleCollider2D", "CapsuleCollider2D",
  "SpriteRenderer", "Sprite", "Texture2D", "Material", "Shader",
  "Camera", "Canvas", "RectTransform", "CanvasGroup",
  "Animator", "Animation", "AnimatorController",
  "AudioSource", "AudioClip", "AudioListener",
  "Light", "ParticleSystem", "TrailRenderer", "LineRenderer",
  "Text", "Image", "Button", "Slider", "Toggle", "InputField",
  "EventSystem", "TextMeshPro", "TMP_Text",
  "SceneManager", "Scene", "Resources", "Application", "Time",
  "Mathf", "Random", "Debug", "Input", "PlayerPrefs",
  "Coroutine", "WaitForSeconds", "WaitForSecondsRealtime", "WaitForEndOfFrame",
  "WaitForFixedUpdate", "WaitUntil", "WaitWhile", "AsyncOperation",
  "List", "Dictionary", "HashSet", "Queue", "Stack", "Array",
  "Task", "Action", "Func", "Predicate",

  // Методы
  "Instantiate", "Destroy", "DestroyImmediate",
  "FindObjectOfType", "FindObjectsOfType", "FindWithTag", "FindGameObjectsWithTag",
  "GetComponent", "GetComponentInChildren", "GetComponentInParent", "GetComponents",
  "TryGetComponent", "AddComponent", "SetActive", "CompareTag",
  "StartCoroutine", "StopCoroutine", "StopAllCoroutines", "Invoke", "CancelInvoke",
  "Debug.Log", "Debug.LogWarning", "Debug.LogError", "Debug.Assert",
  "Debug.DrawLine", "Debug.DrawRay", "Debug.Break",
  "SceneManager.LoadScene", "SceneManager.GetActiveScene",
  "Resources.Load", "Application.Quit", "Application.isPlaying",
  "PlayerPrefs.GetInt", "PlayerPrefs.SetInt", "PlayerPrefs.GetString", "PlayerPrefs.SetString",

  // Свойства / поля
  "transform", "gameObject", "rigidbody", "rigidbody2D", "collider", "camera",
  "position", "localPosition", "rotation", "localRotation", "eulerAngles",
  "localScale", "lossyScale", "forward", "right", "up", "parent", "childCount",
  "magnitude", "sqrMagnitude", "normalized", "zero", "one", "up",
  "deltaTime", "fixedDeltaTime", "time", "frameCount", "timeScale",
  "enabled", "isActiveAndEnabled", "name", "tag", "layer",

  // Атрибуты
  "SerializeField", "HideInInspector", "Header", "Range", "Tooltip",
  "RequireComponent", "ExecuteInEditMode", "ExecuteAlways", "AddComponentMenu",
  "CreateAssetMenu", "ContextMenu", "Space", "TextArea",
  "System.Serializable",
];

// Имена атрибутов C#/Unity. Используется для особого поведения при
// принятии подсказки: после автодополнения в стиле [SerializeField]
// курсор перепрыгивает закрывающую скобку и ставит пробел.
export const ATTRIBUTES = new Set([
  "SerializeField", "HideInInspector", "Header", "Range", "Tooltip",
  "RequireComponent", "ExecuteInEditMode", "ExecuteAlways", "AddComponentMenu",
  "CreateAssetMenu", "ContextMenu", "Space", "TextArea",
  "System.Serializable",
]);

const ALL = [...new Set([...CSHARP, ...UNITY])];

export function suggest(prefix, limit = 5) {
  if (!prefix || prefix.length < MIN_PREFIX) return [];
  const lower = prefix.toLowerCase();
  const out = [];
  for (const w of ALL) {
    if (w.length <= prefix.length) continue;
    if (w.toLowerCase().startsWith(lower)) {
      out.push(w);
      if (out.length >= limit) break;
    }
  }
  return out;
}

// Достаёт префикс слова, которое пользователь уже набрал слева от курсора.
// Возвращает { prefix, start, end } — start/end в координатах textarea.
// Если под курсором не слово — возвращает пустой prefix.
export function getWordAtCursor(textarea) {
  if (!textarea) return { prefix: "", start: 0, end: 0 };
  const value = textarea.value || "";
  const pos = textarea.selectionStart ?? 0;
  if (pos === (textarea.selectionEnd ?? 0) && pos === 0) {
    return { prefix: "", start: 0, end: 0 };
  }
  let i = pos - 1;
  while (i >= 0 && WORD_CHAR.test(value[i])) i--;
  const start = i + 1;
  // Слово — только если курсор в его конце или внутри.
  if (pos === start) return { prefix: "", start: pos, end: pos };
  return {
    prefix: value.slice(start, pos),
    start,
    end: pos,
  };
}

export function getMinPrefix() { return MIN_PREFIX; }
