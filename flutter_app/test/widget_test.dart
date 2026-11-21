import 'package:flutter_test/flutter_test.dart';
import 'package:lookaway/main.dart';

void main() {
  testWidgets('placeholder application renders Hello World', (tester) async {
    await tester.pumpWidget(const MainApp());

    expect(find.byType(MainApp), findsOneWidget);
    expect(find.text('Hello World!'), findsOneWidget);
  });
}
