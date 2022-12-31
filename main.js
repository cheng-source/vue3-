// 当读取对象属性时，把副作用函数放进桶里；当设置属性时，把副作用函数从桶里取出并执行
let affectFunction = null;

function effect(fn) {
    affectFunction = fn;
    fn();
}
const bucket = new WeakMap();
const data = { text: 'hello world' };
const obj = new Proxy(data, {
    get(target, key) {
        if (!affectFunction) {
            return target[key];
        }
        let keyMap = bucket.get(target);
        if (!keyMap) {
            bucket.set(target, (keyMap = new Map()));
        }
        let relySet = keyMap.get(key);
        if (!relySet) {
            keyMap.set(key, (relySet = new Set()));
        }
        relySet.add(affectFunction);
        return target[key];
    },
    set(target, key, value) {
        target[key] = value;
        let keyMap = bucket.get(target);
        if (!keyMap) {
            return
        }
        let relySet = keyMap.get(key);
        relySet && relySet.forEach((fn) => fn());

    }
})